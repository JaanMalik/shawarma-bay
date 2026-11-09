import Foundation

/// Sends a form check to Claude over the internet and streams back the review.
/// The request and the reading of the reply are in FormCoachAPI.swift.
enum FormCoachClient {
    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        // Streaming keeps data coming while Claude thinks, so a long silence means a dropped connection.
        configuration.timeoutIntervalForRequest = 120
        configuration.timeoutIntervalForResource = 600
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()

    /// Sends the request body and returns Claude's review. A request the API turns away because it's
    /// busy or rate limited is tried up to three times in all. Once Claude has started on the reply,
    /// nothing is sent again. Anything else is thrown as a FormCoachError, or CancellationError
    /// when the task is cancelled.
    static func review(apiKey: String, body: Data, onPhase: @escaping @MainActor (FormCoachStream.Phase) -> Void) async throws -> FormCoachReply {
        var request = URLRequest(url: FormCoachRequest.messagesURL)
        request.httpMethod = "POST"
        request.httpBody = body
        for (field, value) in FormCoachRequest.headers(apiKey: apiKey) {
            request.setValue(value, forHTTPHeaderField: field)
        }
        request.setValue("text/event-stream", forHTTPHeaderField: "accept")

        let attempts = 3
        for attempt in 1...attempts {
            try Task.checkCancellation()
            var wait = Double(2 * attempt)
            do {
                let (bytes, response) = try await session.bytes(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                if (200..<300).contains(status) {
                    var stream = FormCoachStream()
                    for try await line in bytes.lines {
                        if stream.feed(line: line) {
                            await onPhase(stream.phase)
                        }
                    }
                    try Task.checkCancellation()
                    // Claude has started on it, which may be billed, so it isn't sent again whatever
                    // happens: trying again is the lifter's call.
                    return try stream.reply()
                } else {
                    var errorBody = Data()
                    for try await byte in bytes {
                        errorBody.append(byte)
                        if errorBody.count > 65_536 { break }
                    }
                    let error = FormCoachResponse.apiError(status: status, body: errorBody)
                    guard error.isRetryable, attempt < attempts else { throw error }
                    if let header = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "retry-after"), let seconds = Double(header) {
                        // A try before retry-after fails anyway, so a long wait is the lifter's call.
                        if seconds > maxWait {
                            throw FormCoachError.retryLater(seconds: Int(seconds.rounded(.up)), rateLimited: status == 429)
                        }
                        wait = seconds
                    }
                }
            } catch let error as URLError {
                if error.code == .cancelled || Task.isCancelled { throw CancellationError() }
                // Not retried: the request may already have been read and billed.
                throw FormCoachError.network(error.localizedDescription)
            }
            await onPhase(.waiting)
            try await Task.sleep(nanoseconds: UInt64(min(max(wait, 1), maxWait) * 1_000_000_000))
        }
        throw FormCoachError.noAnswer
    }

    /// The longest the app waits by itself before trying again, in seconds.
    private static let maxWait = 20.0

    /// Checks that a key is accepted and can use Claude Opus 5.5. This doesn't run the model, so it's free.
    static func verify(apiKey: String) async throws {
        var request = URLRequest(url: FormCoachRequest.modelURL)
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(FormCoachRequest.apiVersion, forHTTPHeaderField: "anthropic-version")
        do {
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else { throw FormCoachResponse.apiError(status: status, body: data) }
        } catch let error as URLError {
            if error.code == .cancelled || Task.isCancelled { throw CancellationError() }
            throw FormCoachError.network(error.localizedDescription)
        }
    }
}
