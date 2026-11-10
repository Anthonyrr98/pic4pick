import Foundation

actor SharedImageRequests<Key: Hashable & Sendable, Value: Sendable> {
    private struct Request {
        let id: UUID
        let task: Task<Void, Never>
        var waiters: [UUID: CheckedContinuation<Value, any Error>]
    }

    private var requests: [Key: Request] = [:]

    func value(for key: Key, load: @escaping @Sendable () async throws -> Value) async throws -> Value {
        let waiter = UUID()
        let value = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Value, any Error>) in
                if Task.isCancelled {
                    continuation.resume(throwing: CancellationError())
                } else if requests[key] != nil {
                    requests[key]?.waiters[waiter] = continuation
                } else {
                    let id = UUID()
                    let task = Task {
                        let result: Result<Value, any Error>
                        do {
                            try Task.checkCancellation()
                            result = .success(try await load())
                        } catch { result = .failure(error) }
                        finish(key, id: id, result: result)
                    }
                    requests[key] = Request(id: id, task: task, waiters: [waiter: continuation])
                }
            }
        } onCancel: {
            Task { await self.cancel(waiter, for: key) }
        }
        try Task.checkCancellation()
        return value
    }

    private func cancel(_ waiter: UUID, for key: Key) {
        guard let continuation = requests[key]?.waiters.removeValue(forKey: waiter) else { return }
        if requests[key]?.waiters.isEmpty == true {
            requests.removeValue(forKey: key)?.task.cancel()
        }
        continuation.resume(throwing: CancellationError())
    }

    private func finish(_ key: Key, id: UUID, result: Result<Value, any Error>) {
        // A cancelled task can finish after another request for the same key starts.
        guard requests[key]?.id == id, let request = requests.removeValue(forKey: key) else { return }
        for waiter in request.waiters.values { waiter.resume(with: result) }
    }
}
