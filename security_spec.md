# Security Specification - Speelox

## 1. Data Invariants
- User settings must always belong to the authenticated user and include a server-verified timestamp.
- Saved posts must be contained within a user's specific collection.
- Users can only read, write, or delete their own data.
- Timestamps (`updatedAt`, `savedAt`) must match `request.time`.
- Document IDs must follow a strict alphanumeric pattern and size limit.

## 2. The "Dirty Dozen" Payloads (Attack Vectors)

| ID | Name | Description | Expected Result |
|----|------|-------------|-----------------|
| D1 | ID Poisoning | Attempt to create settings with a 2KB garbage string as ID | DENIED |
| D2 | Identity Spoofing | User A trying to write settings for User B | DENIED |
| D3 | Unverified Email | Attempt write with `email_verified: false` | DENIED |
| D4 | Field Injection | Create post with `isAdmin: true` hidden field | DENIED |
| D5 | Future Timestamp | Sending a client-side timestamp in the future | DENIED |
| D6 | Shadow Update | Updating settings with an undocumented field | DENIED |
| D7 | Massive String | Post headline > 10KB | DENIED |
| D8 | Orphaned Post | Attempting to create a post in a root collection | DENIED |
| D9 | State Shortcut | Updating `savedAt` without changing content | DENIED |
| D10| Cross-Tenant Read | User A trying to list posts of User B | DENIED |
| D11| Null Auth | Operations without being signed in | DENIED |
| D12| Regex Bypass | ID with special characters like `../secrets` | DENIED |

## 3. Test Cases (Summary)
- `test_unauthenticated_access`: Verifies public access is blocked.
- `test_user_isolation`: Verifies User A cannot touch User B's data.
- `test_strict_schema`: Verifies extra fields are rejected.
- `test_timestamp_integrity`: Verifies only server timestamps are allowed.
- `test_id_validation`: Verifies document IDs are sanitized.
