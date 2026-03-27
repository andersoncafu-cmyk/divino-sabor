import React, { useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { X, Minus, Plus, ShoppingBag, Loader2 } from 'lucide-react';
import { auth, db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, getDocs } from 'firebase/firestore';

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

export default function Cart() {
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
  const { items, isCartOpen, toggleCart, removeItem, updateQuantity, total, clearCart, addItem } = useCartStore();
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [deliveryFee, setDeliveryFee] = useState<number | null>(null);
  const [deliverySettings, setDeliverySettings] = useState<any>(null);
  const [storeSettings, setStoreSettings] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const [changeFor, setChangeFor] = useState('');
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const fetchSettingsAndProducts = async () => {
      try {
        const q = query(collection(db, 'products'), where('active', '==', true));
        const querySnapshot = await getDocs(q);
        const productsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProducts(productsData);

        const docSnap = await getDoc(doc(db, 'settings', 'delivery'));
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

        const storeSnap = await getDoc(doc(db, 'settings', 'store'));
        if (storeSnap.exists()) {
          setStoreSettings(storeSnap.data());
        } else {
          setStoreSettings({
            openTime: '18:00',
            closeTime: '23:30',
            isOpen: true
          });
        }
      } catch (error) {
        console.error("Error fetching settings or products", error);
        setDeliverySettings({
          feeUpTo3: 5.00,
          feeUpTo5: 8.00,
          feeUpTo8: 12.00,
          feeOver8: 15.00,
          fallbackFee: 8.00
        });
        setStoreSettings({
          openTime: '18:00',
          closeTime: '23:30',
          isOpen: true
        });
      }
    };
    fetchSettingsAndProducts();
  }, []);

  const [formData, setFormData] = useState({
    customerName: auth.currentUser?.displayName || '',
    customerPhone: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const cep = e.target.value.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, cep }));

    if (cep.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));

          // Coordenadas da lanchonete (CEP 12239-058)
          const originLat = -23.2615292;
          const originLon = -45.9094012;

          // Busca as coordenadas do endereço do cliente
          const query = encodeURIComponent(`${data.logradouro}, ${data.localidade}, ${data.uf}, Brazil`);
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`);
          const geoData = await geoRes.json();

          if (geoData && geoData.length > 0) {
            const destLat = parseFloat(geoData[0].lat);
            const destLon = parseFloat(geoData[0].lon);
            
            // Calcula a distância em linha reta (Haversine)
            // Adicionamos um fator de 1.3 para compensar o trajeto real nas ruas
            const straightDistance = calculateDistance(originLat, originLon, destLat, destLon);
            const estimatedDistance = straightDistance * 1.3; 
            
            setDistance(estimatedDistance);
            
            let fee = deliverySettings?.feeUpTo3 ?? 5.00;
            if (estimatedDistance > 3 && estimatedDistance <= 5) fee = deliverySettings?.feeUpTo5 ?? 8.00;
            else if (estimatedDistance > 5 && estimatedDistance <= 8) fee = deliverySettings?.feeUpTo8 ?? 12.00;
            else if (estimatedDistance > 8) fee = deliverySettings?.feeOver8 ?? 15.00;
            
            setDeliveryFee(fee);
          } else {
            // Fallback se não encontrar o endereço exato
            setDistance(5); // Distância média fallback
            setDeliveryFee(deliverySettings?.fallbackFee ?? 8.00);
          }
        } else {
          setDistance(null);
          setDeliveryFee(null);
        }
      } catch (error) {
        console.error("Error fetching CEP", error);
        setDistance(null);
        setDeliveryFee(null);
      } finally {
        setLoadingCep(false);
      }
    } else {
      setDistance(null);
      setDeliveryFee(null);
    }
  };

  const isStoreOpen = () => {
    if (!storeSettings) return true; // default to open if not loaded
    if (!storeSettings.isOpen) return false;

    const now = new Date();
    let currentDay = now.getDay();

    if (!storeSettings.openTime || !storeSettings.closeTime) {
      if (storeSettings.operatingDays && !storeSettings.operatingDays.includes(currentDay)) {
        return false;
      }
      return true;
    }

    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [openH, openM] = storeSettings.openTime.split(':').map(Number);
    const openTime = openH * 60 + openM;

    const [closeH, closeM] = storeSettings.closeTime.split(':').map(Number);
    const closeTime = closeH * 60 + closeM;

    let isTimeValid = false;
    if (closeTime < openTime) {
      // Crosses midnight (e.g., 18:00 to 02:00)
      if (currentTime <= closeTime) {
        // It's after midnight, so the "logical" day is the previous day
        currentDay = currentDay === 0 ? 6 : currentDay - 1;
        isTimeValid = true;
      } else if (currentTime >= openTime) {
        isTimeValid = true;
      }
    } else {
      isTimeValid = currentTime >= openTime && currentTime <= closeTime;
    }

    if (storeSettings.operatingDays && !storeSettings.operatingDays.includes(currentDay)) {
      return false;
    }

    return isTimeValid;
  };

  const storeOpen = isStoreOpen();

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      alert("Por favor, faça login para finalizar o pedido.");
      return;
    }
    if (deliveryFee === null) {
      alert("Por favor, insira um CEP válido para calcular a taxa de entrega.");
      return;
    }

    setSubmitting(true);
    try {
      const orderData = {
        userId: auth.currentUser.uid,
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        items: items.map(i => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity
        })),
        total: total() + deliveryFee,
        subtotal: total(),
        deliveryFee: deliveryFee,
        status: 'pending',
        paymentMethod,
        ...(paymentMethod === 'cash' && changeFor ? { changeFor: parseFloat(changeFor) } : {}),
        address: {
          cep: formData.cep,
          street: formData.street,
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state
        },
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'orders'), orderData);
      setSuccess(true);
      clearCart();
      setTimeout(() => {
        setSuccess(false);
        setIsCheckingOut(false);
        toggleCart();
      }, 3000);
    } catch (error) {
      console.error("Error placing order", error);
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={toggleCart}></div>
      
      <div className="relative w-full max-w-md bg-darker h-full shadow-2xl flex flex-col border-l border-white/10 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-accent" />
            {isCheckingOut ? 'Finalizar Pedido' : 'Seu Pedido'}
          </h2>
          <button onClick={toggleCart} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-display text-2xl font-bold mb-2">Pedido Confirmado!</h3>
            <p className="text-gray-400">Seu pedido foi enviado para a cozinha. Acompanhe o status.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
            <ShoppingBag className="w-16 h-16 mb-4 opacity-20" />
            <p>Seu carrinho está vazio.</p>
            <button onClick={toggleCart} className="mt-6 text-accent hover:underline">
              Continuar comprando
            </button>
          </div>
        ) : !isCheckingOut ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {items.map((item) => {
                const itemTotal = item.price + (item.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0);
                return (
                  <div key={item.id} className="flex gap-4 bg-white/5 p-4 rounded-2xl">
                    <img src={getDisplayImageUrl(item.imageUrl)} alt={item.name} className="w-20 h-20 object-cover rounded-xl" referrerPolicy="no-referrer" />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-lg">{item.name}</h4>
                        <p className="text-accent font-semibold">R$ {itemTotal.toFixed(2)}</p>
                        {item.addons && item.addons.length > 0 && (
                          <div className="mt-1 text-xs text-gray-400">
                            {item.addons.map((addon, idx) => (
                              <div key={idx}>+ {addon.name} (R$ {addon.price.toFixed(2)})</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-3 bg-dark rounded-full px-3 py-1">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="hover:text-accent">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="font-bold text-sm w-4 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="hover:text-accent">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        <button onClick={() => removeItem(item.id)} className="text-xs text-red-400 hover:underline">
                          Remover
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Sugestões */}
              {products.filter(p => !items.some(i => i.productId === p.id) && (!p.addons || p.addons.length === 0)).length > 0 && (
                <div className="mt-8 pt-6 border-t border-white/10">
                  <h4 className="font-display font-bold text-lg mb-4 text-white">Você também pode gostar</h4>
                  <div className="space-y-4">
                    {products
                      .filter(p => !items.some(i => i.productId === p.id) && (!p.addons || p.addons.length === 0))
                      .slice(0, 3)
                      .map(suggestedProduct => (
                        <div key={suggestedProduct.id} className="flex gap-4 bg-white/5 p-3 rounded-xl items-center">
                          <img src={getDisplayImageUrl(suggestedProduct.imageUrl)} alt={suggestedProduct.name} className="w-16 h-16 object-cover rounded-lg" referrerPolicy="no-referrer" />
                          <div className="flex-1">
                            <h5 className="font-bold text-sm">{suggestedProduct.name}</h5>
                            <p className="text-accent font-semibold text-sm">R$ {suggestedProduct.price.toFixed(2)}</p>
                          </div>
                          <button 
                            onClick={() => {
                              addItem({
                                productId: suggestedProduct.id,
                                name: suggestedProduct.name,
                                price: suggestedProduct.price,
                                imageUrl: suggestedProduct.imageUrl,
                                addons: []
                              });
                            }}
                            className="p-2 bg-white/10 hover:bg-accent hover:text-dark rounded-full transition-colors"
                            title="Adicionar"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-white/10 bg-dark">
              {!storeOpen && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm text-center font-bold">
                  Estamos fechados no momento.<br/>
                  Horário: {storeSettings?.openTime} às {storeSettings?.closeTime}
                </div>
              )}
              <div className="flex justify-between items-center mb-6">
                <span className="text-gray-400">Total</span>
                <span className="font-display text-3xl font-bold text-accent">R$ {total().toFixed(2)}</span>
              </div>
              <button 
                onClick={() => setIsCheckingOut(true)}
                disabled={!storeOpen}
                className={`w-full py-4 font-bold text-lg rounded-full transition-colors ${storeOpen ? 'bg-accent text-dark hover:bg-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
              >
                Continuar para Entrega
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCheckout} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 pb-32 space-y-4">
              <div className="space-y-4">
                <h3 className="font-bold text-lg border-b border-white/10 pb-2">Seus Dados</h3>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Nome Completo</label>
                  <input required type="text" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Telefone (WhatsApp)</label>
                  <input required type="tel" value={formData.customerPhone} onChange={e => setFormData({...formData, customerPhone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/10">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Forma de Pagamento</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`py-2 px-4 rounded-xl border text-sm font-bold transition-colors ${paymentMethod === 'card' ? 'bg-accent text-dark border-accent' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
                  >
                    Cartão
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-2 px-4 rounded-xl border text-sm font-bold transition-colors ${paymentMethod === 'cash' ? 'bg-accent text-dark border-accent' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
                  >
                    Dinheiro
                  </button>
                </div>
                
                {paymentMethod === 'cash' && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-3">
                    <label className="block text-xs text-gray-400 mb-1">Troco para quanto? (Opcional)</label>
                    <input
                      type="number"
                      min={(total() + (deliveryFee || 0)).toFixed(2)}
                      step="0.01"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      placeholder={`Ex: ${(total() + (deliveryFee || 0) + 50).toFixed(2)}`}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-accent"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-4 border-t border-white/10">
                <h3 className="font-bold text-lg border-b border-white/10 pb-2">Endereço de Entrega</h3>
                <div className="relative">
                  <label className="block text-xs text-gray-400 mb-1">CEP</label>
                  <input required type="text" maxLength={9} value={formData.cep} onChange={handleCepChange} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                  {loadingCep && <Loader2 className="absolute right-3 top-8 w-5 h-5 animate-spin text-accent" />}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Rua</label>
                    <input required type="text" value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Número</label>
                    <input required type="text" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Complemento (Opcional)</label>
                  <input type="text" value={formData.complement} onChange={e => setFormData({...formData, complement: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Bairro</label>
                    <input required type="text" value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Cidade</label>
                    <input required type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-accent" />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 bg-dark">
              <div className="flex justify-between items-center mb-2 text-sm">
                <span className="text-gray-400">Subtotal</span>
                <span className="text-white">R$ {total().toFixed(2)}</span>
              </div>
              {deliveryFee !== null && (
                <div className="flex justify-between items-center mb-4 text-sm">
                  <span className="text-gray-400">Taxa de Entrega ({distance?.toFixed(1)} km)</span>
                  <span className="text-white">R$ {deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center mb-4 border-t border-white/10 pt-4">
                <span className="text-gray-400">Total a Pagar</span>
                <span className="font-display text-2xl font-bold text-accent">R$ {(total() + (deliveryFee || 0)).toFixed(2)}</span>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setIsCheckingOut(false)} className="px-6 py-4 bg-white/10 text-white font-bold rounded-full hover:bg-white/20 transition-colors">
                  Voltar
                </button>
                <button type="submit" disabled={submitting || deliveryFee === null || !storeOpen} className="flex-1 py-4 bg-accent text-dark font-bold rounded-full hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar Pedido'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
