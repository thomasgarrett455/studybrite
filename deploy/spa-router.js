function handler(event) {
    var request = event.request;
    var uri = request.uri;
    // Requests without a file extension are SPA client-side routes (e.g. /classroom/5),
    // not real files in S3. Rewrite them to index.html so React Router can take over.
    // This function is attached ONLY to the S3 (frontend) behavior, so /api/* is never touched.
    if (!uri.includes('.')) {
        request.uri = '/index.html';
    }
    return request;
}