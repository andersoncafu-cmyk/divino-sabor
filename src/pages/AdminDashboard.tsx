import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, updateDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Trash2, CheckCircle, Clock, Truck, XCircle, Package, MessageCircle, Printer, X } from 'lucide-react';
import OrderChat from '../components/OrderChat';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'settings' | 'history' | 'coupons'>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [deliverySettings, setDeliverySettings] = useState<any>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  const [isEditingCoupon, setIsEditingCoupon] = useState(false);
  const [currentCoupon, setCurrentCoupon] = useState<any>(null);
  const [activeChatOrder, setActiveChatOrder] = useState<string | null>(null);
  const [isEndShiftModalOpen, setIsEndShiftModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const playDoorbellSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // Ding
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.5);

      // Dong
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.4); // C5
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.4);
      gain2.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.45);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 2.5);
      osc2.start(ctx.currentTime + 0.4);
      osc2.stop(ctx.currentTime + 2.5);

    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  const hasPending = orders.some(o => o.status === 'pending');

  useEffect(() => {
    if (hasPending) {
      if (!alarmIntervalRef.current) {
        playDoorbellSound();
        alarmIntervalRef.current = setInterval(() => {
          playDoorbellSound();
        }, 4000);
      }
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [hasPending]);

  useEffect(() => {
    // Fetch orders
    const qOrders = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubOrders = onSnapshot(qOrders, (snap) => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch products
    const qProducts = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(qProducts, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch coupons
    const qCoupons = query(collection(db, 'coupons'));
    const unsubCoupons = onSnapshot(qCoupons, (snap) => {
      setCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Fetch delivery settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'delivery'), (docSnap) => {
      if (docSnap.exists()) {
        setDeliverySettings(docSnap.data());
      } else {
        setDeliverySettings({
          feeUpTo3: 5.00,
          feeUpTo5: 8.00,
          feeUpTo8: 12.00,
          feeOver8: 15.00,
          fallbackFee: 8.00
        });
      }
    });

    // Fetch store settings
    const unsubStoreSettings = onSnapshot(doc(db, 'settings', 'store'), (docSnap) => {
      if (docSnap.exists()) {
        setStoreSettings(docSnap.data());
      } else {
        setStoreSettings({
          openTime: '18:00',
          closeTime: '23:30',
          isOpen: true,
          operatingDays: [0, 1, 2, 3, 4, 5, 6]
        });
      }
    });

    return () => {
      unsubOrders();
      unsubProducts();
      unsubCoupons();
      unsubSettings();
      unsubStoreSettings();
    };
  }, []);

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      console.error("Error updating order status", error);
    }
  };

  const handlePrintOrder = (order: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para imprimir o pedido.');
      return;
    }

    const orderDate = order.createdAt ? order.createdAt.toDate().toLocaleString('pt-BR') : 'Data não disponível';
    const paymentMethod = order.paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão';
    const changeText = order.changeFor ? `<p><strong>Troco para:</strong> R$ ${order.changeFor.toFixed(2)}</p>` : '';
    const subtotal = order.subtotal || order.total;

    const itemsHtml = order.items.map((item: any) => {
      const itemTotal = item.price + (item.addons?.reduce((sum: number, a: any) => sum + a.price, 0) || 0);
      const addonsHtml = item.addons && item.addons.length > 0 
        ? `<div style="padding-left: 10px; font-size: 12px; color: #555;">${item.addons.map((a: any) => `+ ${a.name}`).join('<br>')}</div>`
        : '';
      return `
      <div style="border-bottom: 1px dashed #ccc; padding: 4px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 14px;">
          <span>${item.quantity}x ${item.name}</span>
          <span>R$ ${(itemTotal * item.quantity).toFixed(2)}</span>
        </div>
        ${addonsHtml}
      </div>
    `}).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Pedido #${order.id}</title>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; color: #000; }
            h1 { text-align: center; font-size: 1.5em; margin-bottom: 5px; }
            .divider { border-top: 2px dashed #000; margin: 10px 0; }
            .text-center { text-align: center; }
            .flex-between { display: flex; justify-content: space-between; }
            .bold { font-weight: bold; }
            p { margin: 4px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>NOVO PEDIDO</h1>
          <div class="text-center" style="font-size: 12px; margin-bottom: 10px;">Data: ${orderDate}</div>
          <div class="divider"></div>
          
          <p><span class="bold">Cliente:</span> ${order.customerName}</p>
          <p><span class="bold">Telefone:</span> ${order.customerPhone}</p>
          <p><span class="bold">Endereço:</span> ${order.address.street}, ${order.address.number}</p>
          <p>${order.address.neighborhood}, ${order.address.city}</p>
          ${order.address.complement ? `<p><span class="bold">Complemento:</span> ${order.address.complement}</p>` : ''}
          
          <div class="divider"></div>
          <div class="bold" style="margin-bottom: 5px; font-size: 14px;">ITENS DO PEDIDO</div>
          ${itemsHtml}
          
          <div class="divider"></div>
          <div class="flex-between" style="font-size: 14px;">
            <span>Subtotal</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
          </div>
          ${order.deliveryFee !== undefined ? `
          <div class="flex-between" style="font-size: 14px;">
            <span>Taxa de Entrega</span>
            <span>R$ ${order.deliveryFee.toFixed(2)}</span>
          </div>
          ` : ''}
          ${order.coupon ? `
          <div class="flex-between" style="font-size: 14px; color: #4ade80;">
            <span>Cupom (${order.coupon.code})</span>
            <span>- ${order.coupon.type === 'fixed' ? `R$ ${order.coupon.discount.toFixed(2)}` : `${order.coupon.discount}%`}</span>
          </div>
          ` : ''}
          <div class="flex-between bold" style="font-size: 16px; margin-top: 5px;">
            <span>TOTAL</span>
            <span>R$ ${order.total.toFixed(2)}</span>
          </div>
          
          <div class="divider"></div>
          <p><strong>Pagamento:</strong> ${paymentMethod}</p>
          ${changeText}
          
          <div class="divider"></div>
          <div class="text-center" style="margin-top: 20px; font-size: 12px;">
            Obrigado pela preferência!
          </div>
          
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const formatImageUrl = (url: string) => {
    if (url.includes('drive.google.com/file/d/')) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
    } else if (url.includes('drive.google.com/open?id=')) {
      const match = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
    }
    return url;
  };

  const getDisplayImageUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('drive.google.com/uc?export=view&id=')) {
      const id = url.split('id=')[1];
      return `https://lh3.googleusercontent.com/d/${id}`;
    } else if (url.includes('drive.google.com/file/d/')) {
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
    } else if (url.includes('drive.google.com/open?id=')) {
      const match = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `https://lh3.googleusercontent.com/d/${match[1]}`;
      }
    }
    return url;
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedCoupon = {
        ...currentCoupon,
        code: currentCoupon.code.toUpperCase(),
        discount: Number(currentCoupon.discount),
        minOrderValue: Number(currentCoupon.minOrderValue) || 0,
        active: currentCoupon.active !== undefined ? currentCoupon.active : true,
      };

      if (currentCoupon.id) {
        await updateDoc(doc(db, 'coupons', currentCoupon.id), formattedCoupon);
      } else {
        await addDoc(collection(db, 'coupons'), {
          ...formattedCoupon,
          createdAt: new Date().toISOString()
        });
      }
      setIsEditingCoupon(false);
      setCurrentCoupon(null);
    } catch (error) {
      console.error('Error saving coupon:', error);
      alert('Erro ao salvar cupom. Tente novamente.');
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (window.confirm('Tem certeza que deseja excluir este cupom?')) {
      try {
        await deleteDoc(doc(db, 'coupons', couponId));
      } catch (error) {
        console.error('Error deleting coupon:', error);
        alert('Erro ao excluir cupom. Tente novamente.');
      }
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedProduct = {
        ...currentProduct,
        price: isNaN(currentProduct.price) ? 0 : currentProduct.price,
        imageUrl: formatImageUrl(currentProduct.imageUrl),
        priceByAddons: currentProduct.priceByAddons || false,
        addons: currentProduct.addons?.map((addon: any) => ({
          ...addon,
          price: isNaN(addon.price) ? 0 : addon.price
        })) || []
      };

      if (formattedProduct.id) {
        const { id, ...data } = formattedProduct;
        await updateDoc(doc(db, 'products', id), data);
      } else {
        await addDoc(collection(db, 'products'), formattedProduct);
      }
      setIsEditingProduct(false);
      setCurrentProduct(null);
    } catch (error) {
      console.error("Error saving product", error);
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'products', id));
      setProductToDelete(null);
    } catch (error) {
      console.error("Error deleting product", error);
      handleFirestoreError(error, OperationType.DELETE, 'products');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'settings', 'delivery'), deliverySettings).catch(async (err) => {
        if (err.code === 'not-found') {
          // Create if it doesn't exist
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'settings', 'delivery'), deliverySettings);
        } else {
          throw err;
        }
      });
      alert('Configurações salvas com sucesso!');
    } catch (error) {
      console.error("Error saving settings", error);
      handleFirestoreError(error, OperationType.WRITE, 'settings/delivery');
    }
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, 'settings', 'store'), storeSettings).catch(async (err) => {
        if (err.code === 'not-found') {
          const { setDoc } = await import('firebase/firestore');
          await setDoc(doc(db, 'settings', 'store'), storeSettings);
        } else {
          throw err;
        }
      });
      alert('Horário de funcionamento salvo com sucesso!');
    } catch (error) {
      console.error("Error saving store settings", error);
      handleFirestoreError(error, OperationType.WRITE, 'settings/store');
    }
  };

  const handleEndShift = async () => {
    try {
      const batch = writeBatch(db);
      const activeOrders = orders.filter(o => !o.archived);
      
      activeOrders.forEach(order => {
        batch.update(doc(db, 'orders', order.id), { archived: true });
      });
      
      await batch.commit();
      setIsEndShiftModalOpen(false);
      // We can't use alert, so we'll just close the modal.
    } catch (error) {
      console.error("Error ending shift", error);
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    }
  };

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const currentOrders = orders.filter(o => !o.archived);
  const historyOrders = orders.filter(o => o.archived);

  const todaysOrders = currentOrders.filter(order => {
    if (!order.createdAt) return false;
    const orderDate = order.createdAt.toDate();
    return orderDate >= today && order.status !== 'cancelled';
  });

  const totalSales = todaysOrders.reduce((acc, order) => acc + (order.total || 0), 0);
  const cashSales = todaysOrders.filter(o => o.paymentMethod === 'cash').reduce((acc, order) => acc + (order.total || 0), 0);
  const cardSales = todaysOrders.filter(o => o.paymentMethod === 'card').reduce((acc, order) => acc + (order.total || 0), 0);

  return (
    <div className="min-h-screen bg-dark text-white font-body p-6">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="font-display text-3xl font-bold">Painel Administrativo</h1>
          </div>
          <div className="flex bg-darker rounded-full p-1 border border-white/10">
            <button 
              onClick={() => setActiveTab('orders')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'orders' ? 'bg-accent text-dark' : 'text-gray-400 hover:text-white'}`}
            >
              Pedidos
            </button>
            <button 
              onClick={() => setActiveTab('products')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'products' ? 'bg-accent text-dark' : 'text-gray-400 hover:text-white'}`}
            >
              Cardápio
            </button>
            <button 
              onClick={() => setActiveTab('coupons')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'coupons' ? 'bg-accent text-dark' : 'text-gray-400 hover:text-white'}`}
            >
              Cupons
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'settings' ? 'bg-accent text-dark' : 'text-gray-400 hover:text-white'}`}
            >
              Configurações
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-colors ${activeTab === 'history' ? 'bg-accent text-dark' : 'text-gray-400 hover:text-white'}`}
            >
              Histórico
            </button>
          </div>
        </header>

        {activeTab === 'orders' && (
          <div className="space-y-6">
            <div className="flex justify-end mb-4">
              <button onClick={() => setIsEndShiftModalOpen(true)} className="px-6 py-2 bg-red-500 text-white font-bold rounded-full hover:bg-red-600 transition-colors flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Finalizar Turno
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-darker border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Vendas Hoje</h3>
                <p className="text-3xl font-display font-bold text-accent">R$ {totalSales.toFixed(2)}</p>
              </div>
              <div className="bg-darker border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Dinheiro</h3>
                <p className="text-3xl font-display font-bold text-white">R$ {cashSales.toFixed(2)}</p>
              </div>
              <div className="bg-darker border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Cartão</h3>
                <p className="text-3xl font-display font-bold text-white">R$ {cardSales.toFixed(2)}</p>
              </div>
            </div>

            <h2 className="text-2xl font-display font-bold mb-6">Pedidos Recentes</h2>
            {currentOrders.length === 0 ? (
              <p className="text-gray-500">Nenhum pedido encontrado.</p>
            ) : (
              <div className="grid gap-6">
                {currentOrders.map(order => (
                  <div key={order.id} className="bg-darker border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">{order.customerName}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${getStatusColor(order.status)} uppercase tracking-wider`}>
                          {getStatusIcon(order.status)}
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">📞 {order.customerPhone}</p>
                      <p className="text-sm text-gray-400 mb-4">📍 {order.address.street}, {order.address.number} - {order.address.neighborhood}, {order.address.city}</p>
                      
                      <div className="bg-dark rounded-xl p-4 mb-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Itens do Pedido</h4>
                        <ul className="space-y-2">
                          {order.items.map((item: any, idx: number) => {
                            const itemTotal = item.price + (item.addons?.reduce((sum: number, a: any) => sum + a.price, 0) || 0);
                            return (
                              <li key={idx} className="flex flex-col text-sm">
                                <div className="flex justify-between">
                                  <span>{item.quantity}x {item.name}</span>
                                  <span className="text-gray-400">R$ {(itemTotal * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.addons && item.addons.length > 0 && (
                                  <div className="pl-4 mt-1 text-xs text-gray-500">
                                    {item.addons.map((addon: any, aIdx: number) => (
                                      <div key={aIdx}>+ {addon.name}</div>
                                    ))}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        <div className="border-t border-white/10 mt-3 pt-3 flex flex-col gap-1">
                          <div className="flex justify-between text-sm text-gray-400">
                            <span>Pagamento</span>
                            <span className="font-bold text-white">{order.paymentMethod === 'cash' ? 'Dinheiro' : 'Cartão'}</span>
                          </div>
                          {order.paymentMethod === 'cash' && order.changeFor && (
                            <div className="flex justify-between text-sm text-gray-400">
                              <span>Troco para</span>
                              <span className="font-bold text-white">R$ {order.changeFor.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm text-gray-400 mt-2">
                            <span>Subtotal</span>
                            <span>R$ {(order.subtotal || order.total).toFixed(2)}</span>
                          </div>
                          {order.deliveryFee !== undefined && (
                            <div className="flex justify-between text-sm text-gray-400">
                              <span>Taxa de Entrega</span>
                              <span>R$ {order.deliveryFee.toFixed(2)}</span>
                            </div>
                          )}
                          {order.coupon && (
                            <div className="flex justify-between text-sm text-green-400">
                              <span>Cupom ({order.coupon.code})</span>
                              <span>- {order.coupon.type === 'fixed' ? `R$ ${order.coupon.discount.toFixed(2)}` : `${order.coupon.discount}%`}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-accent mt-1 pt-1 border-t border-white/5">
                            <span>Total</span>
                            <span>R$ {order.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Pedido feito em: {order.createdAt?.toDate().toLocaleString('pt-BR')}</p>
                    </div>
                    
                    <div className="flex flex-col gap-2 min-w-[200px] border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ações</h4>
                      <button onClick={() => handlePrintOrder(order)} className="px-4 py-2 bg-white/5 text-white hover:bg-white/10 rounded-lg text-sm font-bold text-left transition-colors flex items-center gap-2">
                        <Printer className="w-4 h-4" /> Imprimir Pedido
                      </button>
                      <button onClick={() => setActiveChatOrder(order.id)} className="px-4 py-2 bg-white/5 text-white hover:bg-white/10 rounded-lg text-sm font-bold text-left transition-colors flex items-center gap-2">
                        <MessageCircle className="w-4 h-4" /> Chat do Pedido
                      </button>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-2 mb-2">Atualizar Status</h4>
                      <button onClick={() => handleUpdateOrderStatus(order.id, 'preparing')} className="px-4 py-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg text-sm font-bold text-left transition-colors">Preparando</button>
                      <button onClick={() => handleUpdateOrderStatus(order.id, 'delivering')} className="px-4 py-2 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 rounded-lg text-sm font-bold text-left transition-colors">Saiu para Entrega</button>
                      <button onClick={() => handleUpdateOrderStatus(order.id, 'completed')} className="px-4 py-2 bg-green-500/10 text-green-500 hover:bg-green-500/20 rounded-lg text-sm font-bold text-left transition-colors">Concluído</button>
                      <button onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')} className="px-4 py-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg text-sm font-bold text-left transition-colors">Cancelar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold">Gerenciar Cardápio</h2>
              <button 
                onClick={() => {
                  setCurrentProduct({ name: '', description: '', price: 0, category: 'Lanches', imageUrl: '', active: true, addons: [] });
                  setIsEditingProduct(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-dark font-bold rounded-full hover:bg-white transition-colors"
              >
                <Plus className="w-5 h-5" /> Novo Produto
              </button>
            </div>

            {isEditingProduct && currentProduct && (
              <div className="bg-darker border border-white/10 rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-top-4">
                <h3 className="text-xl font-bold mb-4">{currentProduct.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                <form onSubmit={handleSaveProduct} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Nome do Produto</label>
                    <input required type="text" value={currentProduct.name} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Preço (R$)</label>
                    <input required type="number" step="0.01" value={currentProduct.price === undefined || Number.isNaN(currentProduct.price) ? '' : currentProduct.price} onChange={e => setCurrentProduct({...currentProduct, price: e.target.value === '' ? '' : parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Categoria</label>
                    <select required value={currentProduct.category} onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent">
                      <option value="Lanches">Lanches</option>
                      <option value="Açaí">Açaí</option>
                      <option value="Bebidas">Bebidas</option>
                      <option value="Porções">Porções</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">URL da Imagem</label>
                    <input required type="url" value={currentProduct.imageUrl} onChange={e => setCurrentProduct({...currentProduct, imageUrl: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Descrição</label>
                    <textarea required value={currentProduct.description} onChange={e => setCurrentProduct({...currentProduct, description: e.target.value})} rows={3} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent"></textarea>
                  </div>
                  
                  {/* Addons Section */}
                  <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <label className="block text-sm font-bold text-white">Adicionais</label>
                      <button 
                        type="button" 
                        onClick={() => {
                          const currentAddons = currentProduct.addons || [];
                          setCurrentProduct({...currentProduct, addons: [...currentAddons, { name: '', price: 0 }]});
                        }}
                        className="flex items-center gap-1 text-xs bg-accent/20 text-accent px-3 py-1.5 rounded-lg hover:bg-accent/30 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Adicionar Item
                      </button>
                    </div>
                    
                    {(!currentProduct.addons || currentProduct.addons.length === 0) ? (
                      <p className="text-sm text-gray-500 italic">Nenhum adicional configurado para este produto.</p>
                    ) : (
                      <div className="space-y-3">
                        {currentProduct.addons.map((addon: any, index: number) => (
                          <div key={index} className="flex items-center gap-3">
                            <div className="flex-1">
                              <input 
                                type="text" 
                                placeholder="Nome do adicional (ex: Bacon)" 
                                value={addon.name} 
                                onChange={e => {
                                  const newAddons = [...currentProduct.addons];
                                  newAddons[index].name = e.target.value;
                                  setCurrentProduct({...currentProduct, addons: newAddons});
                                }} 
                                className="w-full bg-darker border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" 
                                required
                              />
                            </div>
                            <div className="w-32">
                              <input 
                                type="number" 
                                step="0.01" 
                                placeholder="Valor (R$)" 
                                value={addon.price === undefined || Number.isNaN(addon.price) ? '' : addon.price} 
                                onChange={e => {
                                  const newAddons = [...currentProduct.addons];
                                  newAddons[index].price = e.target.value === '' ? '' : parseFloat(e.target.value);
                                  setCurrentProduct({...currentProduct, addons: newAddons});
                                }} 
                                className="w-full bg-darker border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" 
                                required
                              />
                            </div>
                            <button 
                              type="button" 
                              onClick={() => {
                                const newAddons = currentProduct.addons.filter((_: any, i: number) => i !== index);
                                setCurrentProduct({...currentProduct, addons: newAddons});
                              }}
                              className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="active" checked={currentProduct.active} onChange={e => setCurrentProduct({...currentProduct, active: e.target.checked})} className="w-4 h-4 accent-accent" />
                      <label htmlFor="active" className="text-sm text-gray-300">Produto Ativo (Visível no cardápio)</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" id="priceByAddons" checked={currentProduct.priceByAddons || false} onChange={e => setCurrentProduct({...currentProduct, priceByAddons: e.target.checked})} className="w-4 h-4 accent-accent" />
                      <label htmlFor="priceByAddons" className="text-sm text-gray-300">Cobrar apenas pelos adicionais (Ignora o preço base no carrinho. Ideal para "Combos" ou "Escolha seu Sabor")</label>
                    </div>
                  </div>
                  <div className="md:col-span-2 flex gap-4 mt-4">
                    <button type="button" onClick={() => setIsEditingProduct(false)} className="px-6 py-2 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors">Cancelar</button>
                    <button type="submit" className="px-6 py-2 bg-accent text-dark font-bold rounded-lg hover:bg-white transition-colors">Salvar Produto</button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map(product => (
                <div key={product.id} className={`bg-darker border border-white/10 rounded-2xl overflow-hidden flex flex-col ${!product.active && 'opacity-50 grayscale'}`}>
                  <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="w-full h-48 object-cover" referrerPolicy="no-referrer" />
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg">{product.name}</h3>
                      <span className="text-accent font-bold">R$ {product.price.toFixed(2)}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{product.category}</span>
                    <p className="text-sm text-gray-400 mb-4 flex-1 line-clamp-2">{product.description}</p>
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                      <span className={`text-xs font-bold px-2 py-1 rounded ${product.active ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        {product.active ? 'Ativo' : 'Inativo'}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => { setCurrentProduct(product); setIsEditingProduct(true); }} className="p-2 hover:bg-white/10 rounded-lg text-blue-400 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setProductToDelete(product.id)} className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-display font-bold mb-6">Histórico de Pedidos</h2>
            {historyOrders.length === 0 ? (
              <p className="text-gray-500">Nenhum pedido no histórico.</p>
            ) : (
              <div className="grid gap-6">
                {historyOrders.map(order => (
                  <div key={order.id} className="bg-darker border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row gap-6 opacity-75 hover:opacity-100 transition-opacity">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-lg">{order.customerName}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 ${getStatusColor(order.status)} uppercase tracking-wider`}>
                          {getStatusIcon(order.status)}
                          {order.status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">📞 {order.customerPhone}</p>
                      <p className="text-sm text-gray-400 mb-4">📍 {order.address.street}, {order.address.number} - {order.address.neighborhood}, {order.address.city}</p>
                      
                      <div className="bg-dark rounded-xl p-4 mb-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Itens do Pedido</h4>
                        <ul className="space-y-2">
                          {order.items.map((item: any, idx: number) => {
                            const itemTotal = item.price + (item.addons?.reduce((sum: number, a: any) => sum + a.price, 0) || 0);
                            return (
                              <li key={idx} className="flex flex-col text-sm">
                                <div className="flex justify-between">
                                  <span>{item.quantity}x {item.name}</span>
                                  <span className="text-gray-400">R$ {(itemTotal * item.quantity).toFixed(2)}</span>
                                </div>
                                {item.addons && item.addons.length > 0 && (
                                  <div className="pl-4 mt-1 text-xs text-gray-500">
                                    {item.addons.map((addon: any, aIdx: number) => (
                                      <div key={aIdx}>+ {addon.name}</div>
                                    ))}
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        <div className="border-t border-white/10 mt-3 pt-3 flex flex-col gap-1">
                          <div className="flex justify-between text-sm text-gray-400">
                            <span>Subtotal</span>
                            <span>R$ {(order.subtotal || order.total).toFixed(2)}</span>
                          </div>
                          {order.deliveryFee !== undefined && (
                            <div className="flex justify-between text-sm text-gray-400">
                              <span>Taxa de Entrega</span>
                              <span>R$ {order.deliveryFee.toFixed(2)}</span>
                            </div>
                          )}
                          {order.coupon && (
                            <div className="flex justify-between text-sm text-green-400">
                              <span>Cupom ({order.coupon.code})</span>
                              <span>- {order.coupon.type === 'fixed' ? `R$ ${order.coupon.discount.toFixed(2)}` : `${order.coupon.discount}%`}</span>
                            </div>
                          )}
                          <div className="flex justify-between font-bold text-accent mt-1 pt-1 border-t border-white/5">
                            <span>Total</span>
                            <span>R$ {order.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500">Pedido feito em: {order.createdAt?.toDate().toLocaleString('pt-BR')}</p>
                    </div>
                    
                    <div className="flex flex-col gap-2 min-w-[200px] border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ações</h4>
                      <button onClick={() => handlePrintOrder(order)} className="px-4 py-2 bg-white/5 text-white hover:bg-white/10 rounded-lg text-sm font-bold text-left transition-colors flex items-center gap-2">
                        <Printer className="w-4 h-4" />
                        Imprimir Pedido
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'coupons' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold">Gerenciar Cupons</h2>
              <button 
                onClick={() => {
                  setCurrentCoupon({ code: '', discount: 0, minOrderValue: 0, active: true, type: 'percentage' });
                  setIsEditingCoupon(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-dark font-bold rounded-full hover:bg-white transition-colors"
              >
                <Plus className="w-5 h-5" />
                Novo Cupom
              </button>
            </div>

            {isEditingCoupon && currentCoupon && (
              <div className="bg-darker border border-white/10 rounded-2xl p-6 mb-8 animate-in fade-in slide-in-from-top-4">
                <h3 className="text-xl font-bold mb-4">{currentCoupon.id ? 'Editar Cupom' : 'Novo Cupom'}</h3>
                <form onSubmit={handleSaveCoupon} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Código do Cupom</label>
                    <input required type="text" value={currentCoupon.code} onChange={e => setCurrentCoupon({...currentCoupon, code: e.target.value.toUpperCase()})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent uppercase" placeholder="EX: BEMVINDO10" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Tipo de Desconto</label>
                    <select value={currentCoupon.type || 'percentage'} onChange={e => setCurrentCoupon({...currentCoupon, type: e.target.value})} className="w-full bg-dark border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent">
                      <option value="percentage">Porcentagem (%)</option>
                      <option value="fixed">Valor Fixo (R$)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Valor do Desconto</label>
                    <input required type="number" step="0.01" value={currentCoupon.discount || ''} onChange={e => setCurrentCoupon({...currentCoupon, discount: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Valor Mínimo do Pedido (R$)</label>
                    <input required type="number" step="0.01" value={currentCoupon.minOrderValue || ''} onChange={e => setCurrentCoupon({...currentCoupon, minOrderValue: parseFloat(e.target.value)})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2 mt-2">
                    <input type="checkbox" id="couponActive" checked={currentCoupon.active !== false} onChange={e => setCurrentCoupon({...currentCoupon, active: e.target.checked})} className="w-4 h-4 rounded border-white/10 bg-white/5 text-accent focus:ring-accent focus:ring-offset-dark" />
                    <label htmlFor="couponActive" className="text-sm text-white">Cupom Ativo</label>
                  </div>
                  <div className="md:col-span-2 flex gap-4 mt-4">
                    <button type="submit" className="flex-1 bg-accent text-dark font-bold py-3 rounded-xl hover:bg-white transition-colors">
                      {currentCoupon.id ? 'Salvar Alterações' : 'Criar Cupom'}
                    </button>
                    <button type="button" onClick={() => setIsEditingCoupon(false)} className="flex-1 bg-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/20 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {coupons.map(coupon => (
                <div key={coupon.id} className={`bg-darker border rounded-2xl p-6 transition-all ${coupon.active ? 'border-accent/50' : 'border-white/10 opacity-75'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white uppercase tracking-wider">{coupon.code}</h3>
                      <p className="text-accent font-bold mt-1">
                        {coupon.type === 'fixed' ? `R$ ${coupon.discount.toFixed(2)}` : `${coupon.discount}%`} de desconto
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          setCurrentCoupon(coupon);
                          setIsEditingCoupon(true);
                        }}
                        className="p-2 text-gray-400 hover:text-white transition-colors"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleDeleteCoupon(coupon.id)}
                        className="p-2 text-red-400 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p>Pedido mínimo: R$ {coupon.minOrderValue.toFixed(2)}</p>
                    <p>Status: <span className={coupon.active ? 'text-green-400' : 'text-red-400'}>{coupon.active ? 'Ativo' : 'Inativo'}</span></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && deliverySettings && storeSettings && (
          <div className="max-w-2xl mx-auto space-y-12">
            <div>
              <h2 className="text-2xl font-display font-bold mb-6">Horário de Funcionamento</h2>
              <form onSubmit={handleSaveStoreSettings} className="bg-darker border border-white/10 p-8 rounded-3xl space-y-6">
                <div className="flex items-center justify-between bg-dark p-4 rounded-xl border border-white/10">
                  <span className="font-bold text-white">Loja Aberta?</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={storeSettings.isOpen}
                      onChange={e => setStoreSettings({...storeSettings, isOpen: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Abre às</label>
                    <input 
                      type="time" 
                      value={storeSettings.openTime} 
                      onChange={e => setStoreSettings({...storeSettings, openTime: e.target.value})} 
                      className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Fecha às</label>
                    <input 
                      type="time" 
                      value={storeSettings.closeTime} 
                      onChange={e => setStoreSettings({...storeSettings, closeTime: e.target.value})} 
                      className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Dias de Funcionamento</label>
                  <div className="flex flex-wrap gap-2">
                    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => {
                      const isSelected = storeSettings.operatingDays?.includes(index);
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            const newDays = isSelected
                              ? storeSettings.operatingDays.filter((d: number) => d !== index)
                              : [...(storeSettings.operatingDays || []), index];
                            setStoreSettings({ ...storeSettings, operatingDays: newDays });
                          }}
                          className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                            isSelected ? 'bg-accent text-dark' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10">
                  <button type="submit" className="w-full py-4 bg-accent text-dark font-bold rounded-full hover:bg-white transition-colors">
                    Salvar Horário
                  </button>
                </div>
              </form>
            </div>

            <div>
              <h2 className="text-2xl font-display font-bold mb-6">Configurações de Entrega</h2>
              <form onSubmit={handleSaveSettings} className="bg-darker border border-white/10 p-8 rounded-3xl space-y-6">
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Taxa até 3km (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={deliverySettings.feeUpTo3 === undefined || Number.isNaN(deliverySettings.feeUpTo3) ? '' : deliverySettings.feeUpTo3} 
                  onChange={e => setDeliverySettings({...deliverySettings, feeUpTo3: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Taxa de 3km a 5km (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={deliverySettings.feeUpTo5 === undefined || Number.isNaN(deliverySettings.feeUpTo5) ? '' : deliverySettings.feeUpTo5} 
                  onChange={e => setDeliverySettings({...deliverySettings, feeUpTo5: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Taxa de 5km a 8km (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={deliverySettings.feeUpTo8 === undefined || Number.isNaN(deliverySettings.feeUpTo8) ? '' : deliverySettings.feeUpTo8} 
                  onChange={e => setDeliverySettings({...deliverySettings, feeUpTo8: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Taxa acima de 8km (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={deliverySettings.feeOver8 === undefined || Number.isNaN(deliverySettings.feeOver8) ? '' : deliverySettings.feeOver8} 
                  onChange={e => setDeliverySettings({...deliverySettings, feeOver8: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Taxa Padrão (Falha no cálculo) (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  value={deliverySettings.fallbackFee === undefined || Number.isNaN(deliverySettings.fallbackFee) ? '' : deliverySettings.fallbackFee} 
                  onChange={e => setDeliverySettings({...deliverySettings, fallbackFee: e.target.value === '' ? '' : parseFloat(e.target.value)})} 
                  className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div className="pt-4 border-t border-white/10">
                <button type="submit" className="w-full py-4 bg-accent text-dark font-bold rounded-full hover:bg-white transition-colors">
                  Salvar Configurações de Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
        )}
      </div>

      {activeChatOrder && (
        <OrderChat 
          orderId={activeChatOrder} 
          onClose={() => setActiveChatOrder(null)} 
          isAdminView={true} 
        />
      )}

      {isEndShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-darker border border-white/10 rounded-3xl p-8 max-w-md w-full animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-display font-bold mb-4">Finalizar Turno</h2>
            <p className="text-gray-400 mb-8">
              Tem certeza que deseja finalizar o turno? Isso moverá todos os pedidos atuais para o histórico e zerará a tela de pedidos.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsEndShiftModalOpen(false)}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-full font-bold transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleEndShift}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
              >
                Sim, Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-darker border border-white/10 rounded-3xl p-8 max-w-md w-full animate-in fade-in zoom-in duration-200">
            <h2 className="text-2xl font-display font-bold mb-4">Excluir Produto</h2>
            <p className="text-gray-400 mb-8">
              Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => setProductToDelete(null)}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-full font-bold transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteProduct(productToDelete)}
                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-bold transition-colors"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
