import Foundation

// Talking to Claude for a form check: the prompt, the request body, reading the reply (streamed or
// not), errors in plain words and what a check costs. No networking or UI here, so
// Checks/main.swift can verify it. FormCoachClient sends the request.

// MARK: - Asking Claude

/// What the lifter logged for the set being checked.
struct FormCheckContext {
    var exerciseName: String
    var category: ExerciseCategory
    var equipment: Equipment
    /// The weight as shown in the app, e.g. "225 lb".
    var weightText: String
    var reps: Int
    var weightNote: String
    var note: String
}

enum FormPrompt {
    static let system = """
    You are an experienced strength coach. A lifter recorded a set and wants an honest, specific review of their form, so they know what to keep and what to change on their next set.

    You get still frames from the video in time order, each labeled with its time and what the phone's pose tracking thinks is happening, plus the tracking's measurements and what the lifter logged.

    How to review:
    - Judge what the frames show. The labels and numbers come from 2D pose estimation on a phone. They are usually close but can be off when the camera isn't side-on, a limb is hidden behind the bar or plates, or the lifter is far away. When a measurement and the picture disagree, trust the picture and say so in confidence_note.
    - Account for the camera angle. Say what it keeps you from judging (for example depth from the front, or knee tracking from the side) instead of guessing.
    - Hold the lift to good technique for this exercise and equipment, and judge the movement across frames (bar path, tempo, consistency from the first rep to the last), not single poses.
    - If the form is genuinely good, say so plainly. Don't invent problems to have something to fix. Point out form that slips on later reps.
    - fixes: at most 4, most important first. For each: the issue in plain words, why it matters, one short cue to think about during the rep, its severity, and the numbers of the frames that show it.
    - safety_flags: only real injury risks you can see that they should fix before adding weight, such as a rounding lower back under load, knees caving in hard, bouncing the bar off the chest, or slamming the knees straight on a leg press. Leave it empty when there are none.
    - score and verdict go together: 9 to 10 is great (textbook, or nearly), 7 to 8 is good (small details only), 4 to 6 is needs_work (a clear fix, or several problems), and 1 to 3 is unsafe. Use unsafe exactly when safety_flags is not empty.
    - rep_notes: a short note for any rep that stands out, using the rep numbers from the measurements. Leave it empty if the reps look alike.
    - next_set_tip: the one thing to focus on next set.
    - Write for a lifter: short sentences, everyday words, and no jargon without a quick explanation. This is coaching, not medical advice. If something suggests pain or an injury, tell them to stop and get it checked.
    """

    static func frameLabel(_ frame: FormKeyFrame, total: Int) -> String {
        "Frame \(frame.number) of \(total) · \(FormReport.seconds(frame.time)) · \(frame.label)"
    }

    static func request(info: FormCheckContext, measurements: FormMeasurements?, frameCount: Int, duration: Double) -> String {
        var lines = ["Exercise: \(info.exerciseName) (\(info.equipment.rawValue), \(info.category.rawValue))"]
        var setLine = "Set: \(info.weightText) × \(info.reps) \(info.reps == 1 ? "rep" : "reps")"
        if !info.weightNote.isEmpty { setLine += ", weight counted \(info.weightNote)" }
        lines.append(setLine)
        let note = info.note.trimmingCharacters(in: .whitespacesAndNewlines)
        if !note.isEmpty { lines.append("Lifter's note: \(note)") }
        lines.append("Video: \(FormReport.seconds(duration)) long. The \(frameCount) frames above are from it.")
        lines.append("")
        if let measurements {
            lines.append("Phone measurements (2D estimates):")
            lines += FormReport.lines(measurements, loggedReps: info.reps).map { "- \($0)" }
        } else {
            lines.append("The phone couldn't track the lifter in this video, so there are no measurements. Judge from the frames alone.")
        }
        lines.append("")
        lines.append("Review this set. Is the form good, what should they keep doing, and what should they fix?")
        return lines.joined(separator: "\n")
    }
}

enum FormCoachRequest {
    static let messagesURL = URL(string: "https://api.anthropic.com/v1/messages")!
    static let modelURL = URL(string: "https://api.anthropic.com/v1/models/claude-opus-5-5")!
    static let model = "claude-opus-5-5"
    static let apiVersion = "2026-10-21"
    /// Lets the API retry on another Claude model if a safety filter wrongly declines the request.
    static let fallbackBeta = "server-side-fallback-2026-07-01"
    static let effort = "high"
    /// Room for Claude's thinking plus the review. Only what is used is billed.
    static let maxTokens = 32000

    static func headers(apiKey: String) -> [String: String] {
        [
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": apiVersion,
            "anthropic-beta": fallbackBeta,
        ]
    }

    /// The request: each frame's label and picture in time order, then the set's details and the
    /// phone's measurements. Streamed, so data keeps flowing on a slow connection while Claude thinks.
    static func body(system: String, frames: [(label: String, jpeg: Data)], text: String, stream: Bool = true) throws -> Data {
        var content: [[String: Any]] = []
        for frame in frames {
            content.append(["type": "text", "text": frame.label])
            content.append([
                "type": "image",
                "source": ["type": "base64", "media_type": "image/jpeg", "data": frame.jpeg.base64EncodedString()],
            ])
        }
        content.append(["type": "text", "text": text])
        let body: [String: Any] = [
            "model": model,
            "max_tokens": maxTokens,
            "stream": stream,
            "fallbacks": "default",
            "system": system,
            "output_config": [
                "effort": effort,
                "format": ["type": "json_schema", "schema": schema],
            ],
            "messages": [["role": "user", "content": content]],
        ]
        return try JSONSerialization.data(withJSONObject: body)
    }

    /// The shape Claude's answer must take.
    static var schema: [String: Any] {
        func object(_ properties: [String: Any]) -> [String: Any] {
            [
                "type": "object",
                "properties": properties,
                "required": properties.keys.sorted(),
                "additionalProperties": false,
            ]
        }
        func text(_ description: String) -> [String: Any] { ["type": "string", "description": description] }
        func list(_ items: [String: Any], _ description: String) -> [String: Any] {
            ["type": "array", "items": items, "description": description]
        }
        let fix = object([
            "issue": text("The problem, in plain words."),
            "why_it_matters": text("Why it matters for strength or safety."),
            "cue": text("One short cue to think about during the rep."),
            "severity": ["type": "string", "enum": ["minor", "moderate", "major"]],
            "frames": list(["type": "integer"], "Numbers of the frames that show it."),
        ])
        let repNote = object([
            "rep": ["type": "integer", "description": "Rep number, as in the measurements."],
            "note": text("What stands out about this rep."),
        ])
        return object([
            "verdict": ["type": "string", "enum": ["great", "good", "needs_work", "unsafe"]],
            "score": ["type": "integer", "description": "Form score from 1 to 10."],
            "headline": text("One sentence on the set's form."),
            "camera_view": ["type": "string", "enum": ["side", "front", "back", "angled", "unclear"]],
            "confidence": ["type": "string", "enum": ["high", "medium", "low"]],
            "confidence_note": text("What limited the review, or an empty string."),
            "strengths": list(["type": "string"], "What the lifter is doing well."),
            "fixes": list(fix, "Up to 4 fixes, most important first."),
            "safety_flags": list(["type": "string"], "Injury risks visible in the frames, if any."),
            "rep_notes": list(repNote, "Notes on reps that stand out."),
            "next_set_tip": text("The one thing to focus on next set."),
        ])
    }
}

// MARK: - Claude's answer

enum FormVerdict: String, Codable, CaseIterable {
    case great
    case good
    case needsWork = "needs_work"
    case unsafe

    var title: String {
        switch self {
        case .great: return "Great form"
        case .good: return "Good form"
        case .needsWork: return "Needs work"
        case .unsafe: return "Fix before adding weight"
        }
    }

    var shortTitle: String {
        switch self {
        case .great: return "Great form"
        case .good: return "Good form"
        case .needsWork: return "Form: needs work"
        case .unsafe: return "Form: unsafe"
        }
    }
}

struct FormFix: Codable, Hashable {
    var issue: String
    var whyItMatters: String
    var cue: String
    var severity: String
    var frames: [Int]

    enum CodingKeys: String, CodingKey {
        case issue, cue, severity, frames
        case whyItMatters = "why_it_matters"
    }
}

struct FormRepNote: Codable, Hashable {
    var rep: Int
    var note: String
}

struct FormFeedback: Codable, Hashable {
    var verdict: FormVerdict
    var score: Int
    var headline: String
    var cameraView: String
    var confidence: String
    var confidenceNote: String
    var strengths: [String]
    var fixes: [FormFix]
    var safetyFlags: [String]
    var repNotes: [FormRepNote]
    var nextSetTip: String

    enum CodingKeys: String, CodingKey {
        case verdict, score, headline, confidence, strengths, fixes
        case cameraView = "camera_view"
        case confidenceNote = "confidence_note"
        case safetyFlags = "safety_flags"
        case repNotes = "rep_notes"
        case nextSetTip = "next_set_tip"
    }

    var clampedScore: Int { max(1, min(10, score)) }

    /// The verdict that goes with the safety flags and the score, as the prompt lays out. Claude
    /// is asked to keep them in step; this makes sure the label always does.
    var matchingVerdict: FormVerdict {
        if !safetyFlags.isEmpty { return .unsafe }
        switch clampedScore {
        case 9...: return .great
        case 7...8: return .good
        default: return .needsWork
        }
    }
}

struct FormCoachReply: Hashable {
    var feedback: FormFeedback
    /// The model that wrote the review: another Claude model if the first one declined.
    var model: String
    var inputTokens: Int
    var outputTokens: Int
    /// Dollars, with every attempt at its own model's price.
    var cost: Double
}

enum FormCoachError: Error, Equatable {
    case api(status: Int, type: String, message: String)
    /// The Anthropic account reached a spending limit. `message` is the API's, which says when
    /// access comes back.
    case spendLimit(message: String)
    /// Busy or rate limited for longer than is worth waiting for in the app.
    case retryLater(seconds: Int, rateLimited: Bool)
    case refusal(category: String?)
    case cutOff
    case noAnswer
    case unreadable
    case network(String)

    /// Worth trying again by itself: the API was busy or rate limited.
    var isRetryable: Bool {
        guard case .api(let status, let type, _) = self else { return false }
        return status == 429 || status >= 500 || type == "overloaded_error" || type == "rate_limit_error"
    }

    var message: String {
        switch self {
        case .spendLimit(let message):
            let detail = message.isEmpty ? "" : " \(message)"
            return "Your Anthropic account has reached its spending limit.\(detail) To keep going sooner, raise the limit in the Claude Console at platform.claude.com."
        case .retryLater(let seconds, let rateLimited):
            let wait = seconds < 120 ? "\(seconds) seconds" : "\(Int((Double(seconds) / 60).rounded(.up))) minutes"
            return rateLimited ? "Too many requests right now. Try again in \(wait)." : "Claude is busy right now. Try again in \(wait)."
        case .api(let status, let type, let message):
            if status == 401 || type == "authentication_error" {
                return "Your API key wasn't accepted. Check it in Settings > Form check."
            }
            if status == 402 || type == "billing_error" || message.lowercased().contains("credit balance") {
                return "Your Anthropic account is out of credit. Add credit at platform.claude.com, then try again."
            }
            if status == 403 || type == "permission_error" {
                return "This API key isn't allowed to use Claude Opus 5.5."
            }
            if status == 404 || type == "not_found_error" {
                return "Claude Opus 5.5 isn't available to this API key."
            }
            if status == 413 || type == "request_too_large" {
                return "The video frames were too large to send."
            }
            if status == 429 || type == "rate_limit_error" {
                return "Too many requests right now. Wait a minute and try again."
            }
            if status >= 500 || type == "overloaded_error" {
                return "Claude is busy right now. Try again in a minute."
            }
            let detail = message.isEmpty ? "" : " \(message)"
            return "Claude couldn't check this video (error \(status)).\(detail)"
        case .refusal:
            return "Claude declined to review this video. Try a clip that shows only the lift."
        case .cutOff:
            return "Claude's review was cut off. Try again."
        case .noAnswer, .unreadable:
            return "Claude's answer couldn't be read. Try again."
        case .network(let detail):
            return "Couldn't reach Claude. Check your internet connection and try again. (\(detail))"
        }
    }
}

enum FormCoachResponse {
    static func parse(status: Int, body: Data) throws -> FormCoachReply {
        guard (200..<300).contains(status) else { throw apiError(status: status, body: body) }
        guard let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] else {
            throw FormCoachError.unreadable
        }
        let stop = json["stop_reason"] as? String
        if stop == "refusal" {
            let details = json["stop_details"] as? [String: Any]
            throw FormCoachError.refusal(category: details?["category"] as? String)
        }
        if stop == "max_tokens" { throw FormCoachError.cutOff }

        // When a model declines partway through a streamed reply, the next one carries on from
        // where it stopped, so the answer is all the text in order. A reply that started over
        // after the switch point is read from there instead.
        let blocks = json["content"] as? [[String: Any]] ?? []
        func text(_ blocks: ArraySlice<[String: Any]>) -> String {
            blocks.filter { $0["type"] as? String == "text" }.compactMap { $0["text"] as? String }.joined()
        }
        let switches = blocks.filter { $0["type"] as? String == "fallback" }
        let afterLastSwitch = (blocks.lastIndex { $0["type"] as? String == "fallback" }).map { $0 + 1 } ?? 0
        let whole = text(blocks[...]), tail = text(blocks[afterLastSwitch...])
        guard !whole.isEmpty else { throw FormCoachError.noAnswer }
        guard var feedback = [whole, tail].lazy.compactMap({ try? JSONDecoder().decode(FormFeedback.self, from: Data($0.utf8)) }).first else {
            throw FormCoachError.unreadable
        }
        feedback.verdict = feedback.matchingVerdict

        // A stream names the model that was asked for when it opens, even if another one went
        // on to write the review, so the switch points and the attempts say who answered.
        let usageJSON = json["usage"] as? [String: Any]
        let iterations = usageJSON?["iterations"] as? [[String: Any]] ?? []
        let servedBy = iterations.last { $0["type"] as? String == "fallback_message" }?["model"] as? String
        let switchedTo = (switches.last?["to"] as? [String: Any])?["model"] as? String
        let model = servedBy ?? switchedTo ?? json["model"] as? String ?? FormCoachRequest.model
        // Why each model before a switch point declined, in order.
        let declines = switches.map { (($0["trigger"] as? [String: Any])?["category"] as? String) }
        let usage = FormCoachPricing.usage(usageJSON, model: model, declines: declines)
        return FormCoachReply(feedback: feedback, model: model, inputTokens: usage.input, outputTokens: usage.output, cost: usage.dollars)
    }

    static func apiError(status: Int, body: Data) -> FormCoachError {
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
        let error = json?["error"] as? [String: Any]
        let type = error?["type"] as? String ?? ""
        let message = error?["message"] as? String ?? ""
        // A spending limit comes back as a rate limit (the tier's monthly cap) or as a bad request
        // (a limit set in the Console). Waiting a minute won't help either.
        let code = (error?["details"] as? [String: Any])?["error_code"] as? String
        if code == "enforced_spend_limit_reached" || (status == 400 && message.hasPrefix("You have reached your specified")) {
            return .spendLimit(message: message)
        }
        return .api(status: status, type: type, message: message)
    }

    /// An error event partway through a streamed reply. It names a type but has no HTTP status,
    /// so it gets the status that type comes with.
    static func streamError(type: String, message: String) -> FormCoachError {
        let statuses = [
            "invalid_request_error": 400, "authentication_error": 401, "billing_error": 402,
            "permission_error": 403, "not_found_error": 404, "request_too_large": 413,
            "rate_limit_error": 429, "api_error": 500, "timeout_error": 504, "overloaded_error": 529,
        ]
        return .api(status: statuses[type] ?? 500, type: type, message: message)
    }
}

// MARK: - Reading a streamed reply

/// Rebuilds a streamed reply from its server-sent events, so it is read exactly like a plain one.
/// Each event is one `data:` line of JSON whose `type` names the event, so blank lines and
/// `event:` lines can be skipped.
struct FormCoachStream {
    enum Phase: Equatable {
        /// Sent, nothing back yet.
        case waiting
        /// Claude is thinking about the frames.
        case thinking
        /// Claude is writing the review.
        case writing
        /// The reply is complete.
        case done
    }

    private(set) var phase: Phase = .waiting
    /// An error the API sent partway through.
    private(set) var failure: FormCoachError?
    private var message: [String: Any] = [:]
    private var blocks: [Int: [String: Any]] = [:]

    init() {}

    /// Takes one line of the stream. Returns true when the phase changed.
    @discardableResult
    mutating func feed(line: String) -> Bool {
        let text = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text.hasPrefix("data:") else { return false }
        let payload = String(text.dropFirst(5)).trimmingCharacters(in: .whitespaces)
        guard let event = (try? JSONSerialization.jsonObject(with: Data(payload.utf8))) as? [String: Any],
              let type = event["type"] as? String else { return false }
        let before = phase
        switch type {
        case "message_start":
            message = event["message"] as? [String: Any] ?? [:]
            for (index, block) in (message["content"] as? [[String: Any]] ?? []).enumerated() {
                blocks[index] = block
            }
        case "content_block_start":
            guard let index = event["index"] as? Int, let block = event["content_block"] as? [String: Any] else { break }
            blocks[index] = block
            switch block["type"] as? String {
            case "thinking", "redacted_thinking":
                if phase == .waiting { phase = .thinking }
            case "text":
                phase = .writing
            default:
                break
            }
        case "content_block_delta":
            guard let index = event["index"] as? Int, let delta = event["delta"] as? [String: Any], var block = blocks[index] else { break }
            func append(_ key: String, from deltaKey: String) {
                block[key] = (block[key] as? String ?? "") + (delta[deltaKey] as? String ?? "")
            }
            switch delta["type"] as? String {
            case "text_delta": append("text", from: "text")
            case "thinking_delta": append("thinking", from: "thinking")
            case "input_json_delta": append("partial_json", from: "partial_json")
            case "signature_delta": block["signature"] = delta["signature"]
            default: break
            }
            blocks[index] = block
        case "message_delta":
            for (key, value) in event["delta"] as? [String: Any] ?? [:] {
                message[key] = value
            }
            if let usage = event["usage"] as? [String: Any] {
                var merged = message["usage"] as? [String: Any] ?? [:]
                for (key, value) in usage where !(value is NSNull) {
                    merged[key] = value
                }
                message["usage"] = merged
            }
        case "message_stop":
            phase = .done
        case "error":
            let error = event["error"] as? [String: Any]
            failure = FormCoachResponse.streamError(type: error?["type"] as? String ?? "", message: error?["message"] as? String ?? "")
        default:
            // ping and content_block_stop carry nothing to keep.
            break
        }
        return phase != before
    }

    /// The message so far, in the shape of a plain reply.
    func messageData() -> Data? {
        var full = message
        full["content"] = blocks.keys.sorted().compactMap { blocks[$0] }
        return try? JSONSerialization.data(withJSONObject: full)
    }

    /// Claude's review, once the stream has ended.
    func reply() throws -> FormCoachReply {
        if let failure { throw failure }
        guard phase == .done, let data = messageData() else {
            throw FormCoachError.network("The reply stopped partway.")
        }
        return try FormCoachResponse.parse(status: 200, body: data)
    }
}

enum FormCoachPricing {
    /// Dollars per million input and output tokens.
    static func rates(for model: String) -> (input: Double, output: Double) {
        switch model {
        case "claude-opus-5-5": return (4, 20)
        case "claude-sonnet-5-5": return (2, 10)
        default: return (5, 25)
        }
    }

    static func dollars(model: String, input: Int, output: Int) -> Double {
        let rate = rates(for: model)
        return (Double(input) * rate.input + Double(output) * rate.output) / 1_000_000
    }

    /// Refusal categories that are billed even when the model declined before writing anything.
    /// Others, and a missing category, are free. Anthropic may change this list; it's the "Billed
    /// before any output" column of the refusal category table at
    /// platform.claude.com/docs/en/build-with-claude/refusals-and-fallback.
    static let billedBeforeOutput: Set<String> = ["bio", "frontier_llm", "reasoning_extraction"]

    /// Tokens and dollars for a reply. `model` is the one that wrote it. When a fallback ran,
    /// `iterations` lists every attempt, each billed at the price of the model that ran it, and the
    /// top-level counts cover only the last. `declines` are the refusal categories of the switch
    /// points in order: the k-th attempt that declined belongs to the k-th one. An attempt that
    /// declined before writing anything is billed only in the categories above. Its tokens are
    /// still counted.
    static func usage(_ usage: [String: Any]?, model: String, declines: [String?] = []) -> (input: Int, output: Int, dollars: Double) {
        guard let usage else { return (0, 0, 0) }
        let iterations = usage["iterations"] as? [[String: Any]] ?? []
        let attempts = iterations.isEmpty ? [usage] : iterations
        var input = 0, output = 0, dollars = 0.0
        var declined = 0
        for attempt in attempts {
            let i = inputTokens(attempt)
            let o = attempt["output_tokens"] as? Int ?? 0
            let served = iterations.isEmpty || attempt["type"] as? String == "fallback_message"
            // An attempt that declined ran on the model that was asked for; the fallback names its own.
            let ran = attempt["model"] as? String ?? (served ? model : FormCoachRequest.model)
            input += i
            output += o
            var billed = true
            if !served && attempt["type"] as? String == "message" {
                let category = declined < declines.count ? declines[declined] : nil
                declined += 1
                billed = o > 0 || category.map(billedBeforeOutput.contains) == true
            }
            if billed { dollars += self.dollars(model: ran, input: i, output: o) }
        }
        return (input, output, dollars)
    }

    private static func inputTokens(_ usage: [String: Any]) -> Int {
        (usage["input_tokens"] as? Int ?? 0)
            + (usage["cache_creation_input_tokens"] as? Int ?? 0)
            + (usage["cache_read_input_tokens"] as? Int ?? 0)
    }
}
