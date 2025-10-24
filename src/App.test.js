import { render, screen } from '@testing-library/react';
import App from './App';
import {
  __resetSupabaseMock,
  __setAuthUser,
  __setFromHandler,
  createQueryBuilder,
} from './testUtils/supabaseMock';

jest.mock('./supabaseClient', () => require('./testUtils/supabaseMock'));

describe('App navigation', () => {
  beforeEach(() => {
    __resetSupabaseMock();
    window.location.hash = '';
  });

  it('renders the intake form by default and routes to login when dashboard is gated', async () => {
    render(<App />);

    await screen.findByText(/Step 1 of 6/i);

    window.setView('dashboard');

    await screen.findByText(/Sign in to manage clinical work/i);
  });

  it('shows the dashboard when clinician data is available', async () => {
    __setAuthUser({ id: 'clinician-1', email: 'clinician@example.com' });
    __setFromHandler((table) => {
      if (table === 'clinician_emails') {
        return createQueryBuilder({
          resolved: { data: { role: 'admin' }, error: null },
          single: { data: { role: 'admin' }, error: null },
        });
      }
      if (table === 'submissions') {
        return createQueryBuilder({ resolved: { data: [], error: null, count: 0 } });
      }
      return createQueryBuilder();
    });

    window.location.hash = '#dashboard';
    render(<App />);

    await screen.findByText(/Clinician Dashboard/i);
  });
});
