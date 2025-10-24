import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatientPortal from '../PatientPortal';
import {
  createQueryBuilder,
  __resetSupabaseMock,
  __setAuthUser,
  __setFromHandler,
  supabase,
} from '../testUtils/supabaseMock';

jest.mock('../supabaseClient', () => require('../testUtils/supabaseMock'));

describe('PatientPortal', () => {
  beforeEach(() => {
    __resetSupabaseMock();
  });

  it('sends a magic link for login when the user is signed out', async () => {
    const user = userEvent.setup();

    render(<PatientPortal />);

    const emailInput = await screen.findByPlaceholderText(/you@example.com/i);
    await user.type(emailInput, 'patient@example.com');
    await user.click(screen.getByRole('button', { name: /send magic link/i }));

    await screen.findByRole('button', { name: /Link sent/i });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'patient@example.com',
      options: expect.objectContaining({ emailRedirectTo: expect.stringContaining('#patientPortal') }),
    });
  });

  it('shows the submission list when the user is authenticated', async () => {
    __setAuthUser({ id: 'user-1', email: 'patient@example.com' });

    const submissions = [
      {
        id: 'sub-1',
        created_at: '2024-02-01T09:00:00Z',
        first_name: 'Jordan',
        surname: 'Patient',
        email: 'patient@example.com',
        status: 'new',
        spt_ready: true,
        high_risk: false,
        flags: [],
        symptoms: ['hives'],
        food_triggers: ['peanut'],
        attachments: [],
      },
    ];

    __setFromHandler((table) => {
      if (table === 'submissions') {
        return createQueryBuilder({ resolved: { data: submissions, error: null } });
      }
      if (table === 'appointments') {
        return createQueryBuilder({ resolved: { data: [], error: null } });
      }
      return createQueryBuilder();
    });

    render(<PatientPortal />);

    await screen.findByText(/My Allergy Submissions/i);
    expect(screen.getByText(/Jordan Patient/)).toBeInTheDocument();
    expect(screen.getByText(/Ready/)).toBeInTheDocument();
  });
});
