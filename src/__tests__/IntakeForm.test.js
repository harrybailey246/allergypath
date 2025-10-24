import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IntakeForm from '../IntakeForm';
import {
  supabase,
  createQueryBuilder,
  __resetSupabaseMock,
  __setFromHandler,
  __setStorageHandler,
} from '../testUtils/supabaseMock';

jest.mock('../supabaseClient', () => require('../testUtils/supabaseMock'));

describe('IntakeForm', () => {
  beforeEach(() => {
    __resetSupabaseMock();
  });

  it('submits a happy-path intake and shows a confirmation banner', async () => {
    const user = userEvent.setup();
    const insertedPayloads = [];

    __setFromHandler((table) => {
      if (table === 'submissions') {
        return createQueryBuilder({
          resolved: { data: [{ id: 'submission-123' }], error: null, count: 1 },
          single: { data: { id: 'submission-123' }, error: null },
          onInsert: (payload) => {
            insertedPayloads.push(payload);
            return {
              resolved: { data: [{ id: 'submission-123' }], error: null },
              single: { data: { id: 'submission-123' }, error: null },
            };
          },
        });
      }
      return createQueryBuilder();
    });

    __setStorageHandler(() => ({
      upload: jest.fn(async () => ({ data: null, error: null })),
      update: jest.fn(async () => ({ data: null, error: null })),
      createSignedUrl: jest.fn(),
    }));

    render(<IntakeForm />);

    // Step 1: personal information
    await user.type(screen.getByLabelText(/First name/i), 'Alex');
    await user.type(screen.getByLabelText(/Surname/i), 'Patient');
    await user.type(screen.getByLabelText(/Email/i), 'alex@example.com');
    await user.type(screen.getByLabelText(/Phone/i), '0123456789');
    await user.type(screen.getByLabelText(/Date of birth/i), '2000-01-01');
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    // Step 2: symptoms
    await user.click(screen.getByRole('button', { name: /hives/i }));
    await user.type(screen.getByLabelText(/Most severe reaction/i), 'Anaphylaxis after peanuts.');
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    // Step 3: triggers
    await user.click(screen.getByRole('button', { name: /unsure/i }));
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    // Step 4 has only optional inputs
    await user.click(screen.getByRole('button', { name: 'Next →' }));

    // Step 5: skip uploads
    await user.click(screen.getByRole('button', { name: /skip upload/i }));

    // Step 6: confirm and submit
    await user.click(screen.getByLabelText(/I confirm/i));
    await user.click(screen.getByRole('button', { name: /submit form/i }));

    await screen.findByText(/submitted successfully/i);

    expect(insertedPayloads).toHaveLength(1);
    expect(insertedPayloads[0]).toMatchObject({
      first_name: 'Alex',
      surname: 'Patient',
      email: 'alex@example.com',
      phone: '0123456789',
      food_triggers: ['unsure'],
      symptoms: ['hives/urticaria'],
    });

    expect(screen.getByText(/Step 1 of 6/i)).toBeInTheDocument();
    expect(supabase.from).toHaveBeenCalledWith('submissions');
  });
});
