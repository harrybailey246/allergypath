import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookAndPay from '../BookAndPay';
import {
  createQueryBuilder,
  __resetSupabaseMock,
  __setFromHandler,
} from '../testUtils/supabaseMock';

jest.mock('../supabaseClient', () => require('../testUtils/supabaseMock'));

describe('BookAndPay', () => {
  const originalOpen = window.open;

  beforeEach(() => {
    __resetSupabaseMock();
    window.open = jest.fn();
  });

  afterEach(() => {
    window.open = originalOpen;
  });

  it('requires a slot selection and reserves the appointment on submit', async () => {
    const user = userEvent.setup();
    const slot = {
      id: 'slot-1',
      start_at: '2024-03-01T09:00:00Z',
      duration_mins: 60,
      location: 'Clinic A',
      is_booked: false,
      payment_link: 'https://pay.example.com',
    };

    let appointmentSlotCalls = 0;
    const updatePayloads = [];
    const bookingRequests = [];

    __setFromHandler((table) => {
      if (table === 'appointment_slots') {
        appointmentSlotCalls += 1;
        if (appointmentSlotCalls === 1) {
          return createQueryBuilder({ resolved: { data: [slot], error: null } });
        }
        if (appointmentSlotCalls === 2) {
          return createQueryBuilder({
            resolved: { data: null, error: null },
            onUpdate: (payload) => {
              updatePayloads.push(payload);
              return { resolved: { data: null, error: null } };
            },
          });
        }
        return createQueryBuilder({ resolved: { data: [], error: null } });
      }
      if (table === 'booking_requests') {
        return createQueryBuilder({
          resolved: { data: null, error: null },
          onInsert: (payload) => {
            bookingRequests.push(payload);
            return { resolved: { data: null, error: null } };
          },
        });
      }
      return createQueryBuilder();
    });

    render(<BookAndPay />);

    await screen.findByText(/Book a clinic appointment/i);

    await user.type(screen.getByLabelText(/First name/i), 'Jordan');
    await user.type(screen.getByLabelText(/Email/i), 'jordan@example.com');
    await user.type(screen.getByLabelText(/Phone/i), '0123456789');

    await user.click(screen.getByRole('button', { name: /Reserve & continue to payment/i }));
    expect(await screen.findByText(/Choose an appointment slot/i)).toBeInTheDocument();

    const slotButton = await screen.findByRole('button', { name: /Clinic A/ });
    await user.click(slotButton);

    await user.click(screen.getByRole('button', { name: /Reserve & continue to payment/i }));

    await screen.findByText(/We’ve reserved this appointment/i);

    expect(bookingRequests).toHaveLength(1);
    const [payloadArray] = bookingRequests;
    expect(payloadArray[0]).toMatchObject({
      slot_id: 'slot-1',
      first_name: 'Jordan',
      email: 'jordan@example.com',
      phone: '0123456789',
    });
    expect(updatePayloads).toHaveLength(1);
    expect(window.open).toHaveBeenCalledWith('https://pay.example.com', '_blank', 'noopener,noreferrer');
  });
});
