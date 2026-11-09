# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Default Deny & Verified Auth**: No unauthenticated or unverified user can read or write any document (`request.auth != null && request.auth.token.email_verified == true`).
2. **House Membership Gate (`isHouseMember`)**: No user can read or write a house's sessions (`/houses/{houseId}/sessions/{sessionId}`) or items (`/houses/{houseId}/sessions/{sessionId}/items/{itemId}`) unless they are an existing member of `/houses/{houseId}/members/$(request.auth.uid)` or the house owner.
3. **Join Code Verification**: A user can only create their membership document `/houses/{houseId}/members/{memberId}` if `memberId == request.auth.uid`, the parent house exists, and `incoming().joinCode == get(/databases/$(database)/documents/houses/$(houseId)).data.joinCode`.
4. **Session Status Lock Gate**: An order item (`/houses/{houseId}/sessions/{sessionId}/items/{itemId}`) can only be created, modified (qty/notes/payment), or deleted by its author (`authorUid == request.auth.uid`) while the parent session's `status == 'open'`. Once the supervisor changes `status` to `'sent'` or `'arrived'`, student writes/deletes are strictly denied.
5. **Supervisor Status Transition**: Only the house/session owner (`ownerId == request.auth.uid`) or bootstrapped admin (`yamenelrays1@gmail.com`) can change a session's `status` (`'open'`, `'sent'`, `'arrived'`).

## 2. The "Dirty Dozen" Payloads
1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` attempting to create a house or item -> `PERMISSION_DENIED`.
2. **Non-Member Read of Session**: Authenticated user who is NOT in `/houses/{houseId}/members/{uid}` attempting `get` on `/houses/{houseId}/sessions/{sessionId}` -> `PERMISSION_DENIED`.
3. **Wrong Join Code Membership Creation**: User attempting to join `/houses/{houseId}/members/{uid}` with `joinCode: "WRONG"` -> `PERMISSION_DENIED`.
4. **Identity Spoofing on Membership**: User `uid_1` attempting to create `/houses/{houseId}/members/uid_2` -> `PERMISSION_DENIED`.
5. **Non-Member Item Creation**: User who is not a member of `houseId` attempting to create an item in `/houses/{houseId}/sessions/{sessionId}/items/{itemId}` -> `PERMISSION_DENIED`.
6. **Student Editing Item After Status is 'sent'**: Author attempting to update `qty` when parent session has `status == 'sent'` -> `PERMISSION_DENIED`.
7. **Student Deleting Item After Status is 'sent'**: Author attempting to delete their item when parent session has `status == 'sent'` -> `PERMISSION_DENIED`.
8. **Student Changing Session Status**: Non-owner student attempting to update session `status` from `'open'` to `'sent'` -> `PERMISSION_DENIED`.
9. **Shadow Field Injection on Item Update**: Author attempting to update `qty` while injecting `{ ghostField: true }` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation (`createdAt` / `authorUid`)**: Author attempting to change `authorUid` or `createdAt` during an item update -> `PERMISSION_DENIED`.
11. **Value Poisoning (`qty` out of range)**: Author attempting to set `qty: 500` or `qty: -1` -> `PERMISSION_DENIED`.
12. **Client Timestamp Spoofing**: User attempting to create an item with a forged `createdAt` not matching `request.time` -> `PERMISSION_DENIED`.
