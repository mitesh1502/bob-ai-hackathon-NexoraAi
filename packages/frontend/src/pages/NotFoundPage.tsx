import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card max-w-md text-center">
        <div className="text-6xl mb-4">🔌</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">404</h1>
        <p className="text-gray-600 mb-6">The page you're looking for doesn't exist.</p>
        <div className="flex gap-3 justify-center">
          <Link to="/" className="btn-primary">Go Home</Link>
          <Link to="/login" className="btn-outline">Login</Link>
        </div>
      </div>
    </div>
  );
}
