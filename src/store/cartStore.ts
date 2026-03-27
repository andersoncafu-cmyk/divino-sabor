import { create } from 'zustand';

export interface CartItemAddon {
  name: string;
  price: number;
}

export interface CartItem {
  id: string; // Unique ID for the cart item (productId + addons signature)
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string;
  addons?: CartItemAddon[];
}

interface CartState {
  items: CartItem[];
  isCartOpen: boolean;
  addItem: (item: Omit<CartItem, 'quantity' | 'id'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  isCartOpen: false,
  addItem: (item) => {
    set((state) => {
      // Generate a unique ID based on product ID and selected addons
      const addonsSignature = item.addons 
        ? item.addons.map(a => `${a.name}-${a.price}`).sort().join('|') 
        : '';
      const cartItemId = `${item.productId}${addonsSignature ? `|${addonsSignature}` : ''}`;

      const existingItem = state.items.find((i) => i.id === cartItemId);
      if (existingItem) {
        return {
          items: state.items.map((i) =>
            i.id === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { ...item, id: cartItemId, quantity: 1 }] };
    });
  },
  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((i) => i.id !== id),
    }));
  },
  updateQuantity: (id, quantity) => {
    set((state) => {
      if (quantity <= 0) {
        return { items: state.items.filter((i) => i.id !== id) };
      }
      return {
        items: state.items.map((i) =>
          i.id === id ? { ...i, quantity } : i
        ),
      };
    });
  },
  clearCart: () => set({ items: [] }),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
  total: () => {
    const { items } = get();
    return items.reduce((acc, item) => {
      const itemTotal = item.price + (item.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0);
      return acc + itemTotal * item.quantity;
    }, 0);
  },
}));
