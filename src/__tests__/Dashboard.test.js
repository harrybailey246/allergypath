import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../Dashboard';
import {
  createQueryBuilder,
  __resetSupabaseMock,
  __setAuthUser,
  __setFromHandler,
} from '../testUtils/supabaseMock';

jest.mock('../supabaseClient', () => require('../testUtils/supabaseMock'));

describe('Dashboard', () => {
  beforeEach(() => {
    __resetSupabaseMock();
    __setAuthUser({ id: 'clinician-1', email: 'clinician@example.com' });
  });

  it('filters submissions by search input', async () => {
    const user = userEvent.setup();
    const rows = [
      {
        id: '1',
        created_at: '2024-01-01T10:00:00Z',
        first_name: 'Sam',
        surname: 'Alpha',
        email: 'sam.alpha@example.com',
        high_risk: true,
        spt_ready: true,
        status: 'new',
        flags: ['priority'],
        symptoms: ['hives'],
        food_triggers: ['peanut'],
        clinician_email: null,
      },
      {
        id: '2',
        created_at: '2024-01-02T11:00:00Z',
        first_name: 'Jamie',
        surname: 'Beta',
        email: 'jamie.beta@example.com',
        high_risk: false,
        spt_ready: false,
        status: 'new',
        flags: [],
        symptoms: ['eczema'],
        food_triggers: ['milk'],
        clinician_email: 'nurse@example.com',
      },
    ];

    __setFromHandler((table) => {
      if (table === 'submissions') {
        return createQueryBuilder({
          resolved: { data: rows, error: null, count: rows.length },
        });
      }
      return createQueryBuilder();
    });

    render(<Dashboard />);

    // wait for both patients to appear
    await screen.findByText(/Sam Alpha/);
    expect(screen.getByText(/Jamie Beta/)).toBeInTheDocument();

    const search = screen.getByPlaceholderText(/search name or email/i);
    await user.clear(search);
    await user.type(search, 'Jamie');

    const table = screen.getByRole('table');
    await within(table).findByText(/Jamie Beta/);
    expect(within(table).queryByText(/Sam Alpha/)).not.toBeInTheDocument();
  });

  it('opens the detail panel and shows appointment context', async () => {
    const user = userEvent.setup();
    const row = {
      id: '3',
      created_at: '2024-01-03T09:00:00Z',
      first_name: 'Taylor',
      surname: 'Case',
      email: 'taylor.case@example.com',
      high_risk: true,
      spt_ready: false,
      status: 'new',
      flags: ['call family'],
      symptoms: ['wheezing'],
      food_triggers: ['egg'],
      clinician_email: null,
      clinician_notes: 'Needs spirometry.',
      most_severe_reaction: 'Required epinephrine in A&E.',
    };
    const appointmentRows = [
      {
        id: 'appt-1',
        submission_id: '3',
        start_at: '2024-02-01T10:00:00Z',
        end_at: '2024-02-01T11:00:00Z',
        location: 'Clinic Room 2',
        notes: 'Bring peak flow readings.',
      },
    ];

    __setFromHandler((table) => {
      if (table === 'submissions') {
        return createQueryBuilder({
          resolved: { data: [row], error: null, count: 1 },
        });
      }
      if (table === 'appointments') {
        return createQueryBuilder({
          resolved: { data: appointmentRows, error: null },
        });
      }
      if (table === 'comments') {
        return createQueryBuilder({ resolved: { data: [], error: null } });
      }
      return createQueryBuilder();
    });

    render(<Dashboard />);
    const patientRow = await screen.findByText(/Taylor Case/);
    await user.click(patientRow);

    await screen.findByRole('heading', { name: /Appointments/i });
    expect(screen.getByText(/Clinic Room 2/)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Needs spirometry/)).toBeInTheDocument();
  });
});
