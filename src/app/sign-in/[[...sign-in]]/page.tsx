import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/auth/auth-shell';
import { ApiKeySignInForm } from './api-key-sign-in-form';

export default function SignInPage() {
  return (
    <AuthShell>
      <div className="w-full max-w-100">
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              card: 'bg-transparent shadow-none p-0',
              footer: 'hidden',
            },
          }}
        />
        <ApiKeySignInForm />
      </div>
    </AuthShell>
  );
}
