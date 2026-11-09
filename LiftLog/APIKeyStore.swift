import Foundation
import Security

/// The Anthropic API key the lifter pastes in for form checks. It is kept in the iPhone's Keychain,
/// on this device only (not in backups or iCloud), and is only ever sent to Anthropic's API.
enum APIKeyStore {
    private static let service = "com.jaanmalik.liftlog.anthropic"
    private static let account = "api-key"

    private static var query: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func load() -> String? {
        read().key
    }

    /// The saved key, with the Keychain's answer: errSecItemNotFound when there's none, and
    /// errSecInteractionNotAllowed while the phone is locked, since the key is only readable
    /// while it's unlocked.
    private static func read() -> (key: String?, status: OSStatus) {
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(search as CFDictionary, &result)
        guard status == errSecSuccess,
              let data = result as? Data,
              let key = String(data: data, encoding: .utf8),
              !key.isEmpty else { return (nil, status) }
        return (key, status)
    }

    /// Replaces any saved key. Returns false if the Keychain refused it.
    @discardableResult
    static func save(_ key: String) -> Bool {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = Data(trimmed.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let saved = SecItemAdd(item as CFDictionary, nil) == errSecSuccess
        UserDefaults.standard.set(saved, forKey: SettingsKey.hasAPIKey)
        return saved
    }

    static func delete() {
        SecItemDelete(query as CFDictionary)
        UserDefaults.standard.set(false, forKey: SettingsKey.hasAPIKey)
    }

    /// Keeps the "key saved" setting the screens watch in step with the Keychain. Only a clear
    /// answer changes it: a locked phone can't read a key that is there.
    static func refreshFlag() {
        let (key, status) = read()
        guard status == errSecSuccess || status == errSecItemNotFound else { return }
        UserDefaults.standard.set(key != nil, forKey: SettingsKey.hasAPIKey)
    }
}
