"use client";

import { useEffect } from "react";

const COGNITO_DOMAIN = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || "";
const CLIENT_ID = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "";
const REDIRECT_URI = encodeURIComponent(process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL || "");
const SCOPES = encodeURIComponent("openid email profile");

const LOGIN_URL = `${COGNITO_DOMAIN}/login?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;
const SIGNUP_URL = `${COGNITO_DOMAIN}/signup?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&scope=${SCOPES}`;

export default function LoginPage() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Welcome to Agent77
        </h1>
        <p className="mt-3 text-gray-500">
          Sign in to manage your AI chatbot.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <a
            href={LOGIN_URL}
            className="rounded-lg bg-blue-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Log in
          </a>
          <a
            href={SIGNUP_URL}
            className="rounded-lg border border-gray-200 px-6 py-3 text-base font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-50"
          >
            Create an account
          </a>
        </div>
        <p className="mt-6 text-xs text-gray-400">
          Secured by Amazon Cognito
        </p>
      </div>
    </main>
  );
}
