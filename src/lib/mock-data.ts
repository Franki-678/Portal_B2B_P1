import { User, Workshop, Order, Quote, QuoteItem, OrderEvent } from './types';

// ============================================================
// USUARIOS DEMO
// ============================================================

export const MOCK_USERS: User[] = [
  {
    id: 'user-taller-1',
    email: 'taller1@demo.com',
    name: 'Taller AutoSur',
    role: 'taller',
    workshopId: 'ws-1',
  },
  {
    id: 'user-taller-2',
    email: 'taller2@demo.com',
    name: 'Chapa & Pintura Norte',
    role: 'taller',
    workshopId: 'ws-2',
  },
  {
    id: 'user-vendedor-1',
    email: 'vendedor@demo.com',
    name: 'Carlos Méndez',
    role: 'vendedor',
  },
];

// ============================================================
// TALLERES DEMO
// ============================================================

export const MOCK_WORKSHOPS: Workshop[] = [
  {
    id: 'ws-1',
    name: 'Taller AutoSur',
    address: 'Av. Corrientes 3450, CABA',
    phone: '11-4567-8901',
    contactName: 'Roberto Fernández',
    email: 'taller1@demo.com',
    createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: 'ws-2',
    name: 'Chapa & Pintura Norte',
    address: 'Ruta 8 km 45, Pilar, GBA',
    phone: '0230-456-7890',
    contactName: 'María González',
    email: 'taller2@demo.com',
    createdAt: '2024-02-20T10:00:00Z',
  },
];

// ============================================================
// PEDIDOS DEMO — con datos realistas de autopartes
// ============================================================

// MOCK_ORDERS eliminado porque la app ahora depende 100% de Supabase

