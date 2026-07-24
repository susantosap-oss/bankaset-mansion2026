'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-7xl font-bold text-gray-200 mb-4">500</p>
          <h1 className="text-xl font-semibold text-gray-800 mb-2">Terjadi kesalahan</h1>
          <p className="text-sm text-gray-500 mb-2">
            Aplikasi mengalami error yang tidak terduga.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 mb-4 font-mono">ID: {error.digest}</p>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Coba Lagi
          </button>
        </div>
      </body>
    </html>
  );
}
