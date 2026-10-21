# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Authentication & Verification Invariant**: Every read and write operation requires an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
2. **Master Gate & Relational Sync Invariant**: An order item (`/sessions/{sessionId}/orders/{orderId}`) cannot be created, read (single doc), updated, or deleted unless the parent session (`/sessions/{sessionId}`) exists and the requesting user is listed in the parent session's `memberUids` or is the `ownerId`.
3. **Identity Integrity Invariant**: On creation of an `OrderSession`, `ownerId` must equal `request.auth.uid` and `request.auth.uid in memberUids`. On creation of a `RoommateOrderItem`, `authorUid` must equal `request.auth.uid`, `sessionId` must equal the path `{sessionId}`, and `sessionOwnerId` must equal the parent session's `ownerId`.
4. **Immutable Ownership & Temporal Invariant**: `ownerId`, `authorUid`, `sessionId`, `sessionOwnerId`, and `createdAt` can never change on update. `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
5. **Terminal State Lock Invariant**: Once an `OrderSession` reaches `status == 'completed'`, no further updates are permitted on that session document.
6. **Bounded Array & Volumetric Invariant**: Every string has strict `.size()` bounds matching `firebase-blueprint.json`, IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), and `memberUids` is bounded to `size() >= 1 && size() <= 10` with string validation on the first element.
7. **Secure List Query Invariant**: `allow list` never uses `get()` or `exists()` and strictly checks `request.auth.uid in resource.data.memberUids || resource.data.ownerId == request.auth.uid` (for sessions) and `request.auth.uid in resource.data.memberUids || resource.data.authorUid == request.auth.uid || resource.data.sessionOwnerId == request.auth.uid` (for orders).

## 2. The "Dirty Dozen" Payloads

1. **Payload 1 — Identity Spoofing on Session Create (`ownerId` mismatch)**:
   ```json
   {
     "title": "عشا السكن",
     "storeName": "كشري التحرير",
     "masterName": "أحمد",
     "roomCode": "SAKAN-204",
     "deliveryFee": 20,
     "status": "open",
     "ownerId": "victim_uid_999",
     "memberUids": ["attacker_uid"],
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
2. **Payload 2 — Shadow Field Injection on Session Create (`isAdmin: true`)**:
   ```json
   {
     "title": "عشا السكن",
     "storeName": "كشري التحرير",
     "masterName": "أحمد",
     "roomCode": "SAKAN-204",
     "deliveryFee": 20,
     "status": "open",
     "ownerId": "user_1",
     "memberUids": ["user_1"],
     "isVerifiedAdmin": true,
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
3. **Payload 3 — Unbounded Array Denial-of-Wallet (`memberUids.size() > 10`)**:
   ```json
   {
     "title": "عشا السكن",
     "storeName": "كشري التحرير",
     "masterName": "أحمد",
     "roomCode": "SAKAN-204",
     "deliveryFee": 20,
     "status": "open",
     "ownerId": "user_1",
     "memberUids": ["u1","u2","u3","u4","u5","u6","u7","u8","u9","u10","u11"],
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
4. **Payload 4 — Terminal State Modification (`status == 'completed'` mutated back to `'open'`)**:
   ```json
   {
     "status": "open",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
5. **Payload 5 — Orphaned Order Creation (Non-existent parent `sessionId`)**:
   ```json
   {
     "sessionId": "non_existent_session",
     "sessionOwnerId": "user_1",
     "authorUid": "user_1",
     "memberUids": ["user_1"],
     "roommateName": "عمر",
     "roomNumber": "غرفة 2",
     "itemName": "شيبسي",
     "normalizedItemKey": "شيبسي",
     "category": "snacks",
     "quantity": 3,
     "unitPrice": 15,
     "paymentMethod": "cash",
     "cashPaidAmount": 50,
     "isPaid": true,
     "isPurchased": false,
     "notes": "",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
6. **Payload 6 — Order Author Spoofing (`authorUid != request.auth.uid`)**:
   ```json
   {
     "sessionId": "session_1",
     "sessionOwnerId": "user_1",
     "authorUid": "someone_else_uid",
     "memberUids": ["user_1"],
     "roommateName": "عمر",
     "roomNumber": "غرفة 2",
     "itemName": "شيبسي",
     "normalizedItemKey": "شيبسي",
     "category": "snacks",
     "quantity": 2,
     "unitPrice": 15,
     "paymentMethod": "cash",
     "cashPaidAmount": 30,
     "isPaid": true,
     "isPurchased": false,
     "notes": "",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
7. **Payload 7 — Negative Price / Quantity Manipulation (`quantity: -5`, `unitPrice: -100`)**:
   ```json
   {
     "sessionId": "session_1",
     "sessionOwnerId": "user_1",
     "authorUid": "user_1",
     "memberUids": ["user_1"],
     "roommateName": "عمر",
     "roomNumber": "غرفة 2",
     "itemName": "شيبسي",
     "normalizedItemKey": "شيبسي",
     "category": "snacks",
     "quantity": -5,
     "unitPrice": -100,
     "paymentMethod": "cash",
     "cashPaidAmount": 0,
     "isPaid": false,
     "isPurchased": false,
     "notes": "",
     "createdAt": "SERVER_TIMESTAMP",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
8. **Payload 8 — Resource Poisoning (`itemName` > 100 chars)**:
   ```json
   {
     "itemName": "شيبسي................................................................................................................"
   }
   ```
9. **Payload 9 — Immutable Field Mutation (`createdAt` or `authorUid` altered on update)**:
   ```json
   {
     "authorUid": "hijacked_uid",
     "updatedAt": "SERVER_TIMESTAMP"
   }
   ```
10. **Payload 10 — Unverified Email Spoof Attack (`email_verified: false`)**:
    ```json
    {
      "auth": { "uid": "user_1", "token": { "email": "yamenelrays1@gmail.com", "email_verified": false } }
    }
    ```
11. **Payload 11 — Unauthorized Blanket List Query on Orders (`where` filter omitted)**:
    ```json
    {
      "operation": "list",
      "path": "/sessions/session_1/orders"
    }
    ```
12. **Payload 12 — Value Poisoning on Whitelisted Update Key (`isPurchased: "yes"` instead of boolean)**:
    ```json
    {
      "isPurchased": "yes",
      "updatedAt": "SERVER_TIMESTAMP"
    }
    ```

## 3. Test Runner Reference
See `firestore.rules.test.ts` for the automated test suite verifying all 12 Dirty Dozen payloads against the security rules invariants.
