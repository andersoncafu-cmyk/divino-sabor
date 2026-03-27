import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { X, Clock, Package, Truck, CheckCircle, XCircle, MessageCircle } from 'lucide-react';
import OrderChat from './OrderChat';

interface MyOrdersProps {
  onClose: () => void;
}

export default function MyOrders({ onClose }: MyOrdersProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChatOrder, setActiveChatOrder] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'orders'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'pending': return 'text-yellow-500 bg-yellow-500/10';
      case 'preparing': return 'text-blue-500 bg-blue-500/10';
      case 'delivering': return 'text-purple-500 bg-purple-500/10';
      case 'completed': return 'text-green-500 bg-green-500/10';
      case 'cancelled': return 'text-red-500 bg-red-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'preparing': return <Package className="w-4 h-4" />;
      case 'delivering': return <Truck className="w-4 h-4" />;
      case 'completed': return <CheckCircle className="w-4 h-4" />;
      case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return null;
    }
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'pending': return 'Pendente';
      case 'preparing': return 'Preparando';
      case 'delivering': return 'A Caminho';
      case 'completed': return 'Concluído';
      case 'cancelled': return 'Cancelado';
      default: return 'Desconhecido';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-md bg-darker h-full shadow-2xl flex flex-col border-l border-white/10 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            Meus Pedidos
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Package className="w-16 h-16 mb-4 opacity-20" />
              <p>Você ainda não fez nenhum pedido.</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${getStatusColor(order.status)} uppercase tracking-wider`}>
                    {getStatusIcon(order.status)}
                    {getStatusText(order.status)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {order.createdAt?.toDate().toLocaleDateString('pt-BR')}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {order.items.map((item: any, idx: number) => {
                    const itemTotal = item.price + (item.addons?.reduce((sum: number, a: any) => sum + a.price, 0) || 0);
                    return (
                      <div key={idx} className="flex flex-col text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-300">{item.quantity}x {item.name}</span>
                          <span className="text-gray-500">R$ {(itemTotal * item.quantity).toFixed(2)}</span>
                        </div>
                        {item.addons && item.addons.length > 0 && (
                          <div className="pl-4 mt-1 text-xs text-gray-500">
                            {item.addons.map((addon: any, aIdx: number) => (
                              <div key={aIdx}>+ {addon.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="border-t border-white/10 pt-3 flex flex-col gap-1">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>Pagamento</span>
                    <span className="text-white">{order.paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão'}</span>
                  </div>
                  {order.paymentMethod === 'cash' && order.changeFor && (
                    <div className="flex justify-between text-sm text-gray-400">
                      <span>Troco para</span>
                      <span className="text-white">R$ {order.changeFor.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm text-gray-400">Total</span>
                    <span className="font-bold text-accent">R$ {order.total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3 flex justify-end">
                  <button 
                    onClick={() => setActiveChatOrder(order.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-full transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Falar com a Loja
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {activeChatOrder && (
        <OrderChat 
          orderId={activeChatOrder} 
          onClose={() => setActiveChatOrder(null)} 
          isAdminView={false} 
        />
      )}
    </div>
  );
}
