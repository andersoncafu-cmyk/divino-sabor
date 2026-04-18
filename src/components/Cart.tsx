import React, { useState, useEffect } from 'react';
import { useCartStore } from '../store/cartStore';
import { X, Minus, Plus, ShoppingBag, Loader2, ShoppingCart } from 'lucide-react';
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
  const { items, isCartOpen, toggleCart, removeItem, updateQuantity, total, clearCart, addItem, coupon, setCoupon } = useCartStore();
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
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [showUpsell, setShowUpsell] = useState(false);
  const [upsellSuggestions, setUpsellSuggestions] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [selectedProductForAddons, setSelectedProductForAddons] = useState<any>(null);
  const [selectedAddons, setSelectedAddons] = useState<any[]>([]);

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

  const handleApplyCoupon = async () => {
    if (!couponCode) return;
    setApplyingCoupon(true);
    setCouponError('');
    
    try {
      const q = query(collection(db, 'coupons'), where('code', '==', couponCode.toUpperCase()));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setCouponError('Cupom inválido ou não encontrado.');
        setCoupon(null);
        setApplyingCoupon(false);
        return;
      }

      const couponData = querySnapshot.docs[0].data();
      
      if (!couponData.active) {
        setCouponError('Este cupom não está mais ativo.');
        setCoupon(null);
        setApplyingCoupon(false);
        return;
      }

      const cartSubtotal = items.reduce((acc, item) => {
        const itemTotal = item.price + (item.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0);
        return acc + itemTotal * item.quantity;
      }, 0);

      if (cartSubtotal < couponData.minOrderValue) {
        setCouponError(`O valor mínimo para este cupom é R$ ${couponData.minOrderValue.toFixed(2)}`);
        setCoupon(null);
        setApplyingCoupon(false);
        return;
      }

      setCoupon(couponData);
      setCouponCode('');
    } catch (error) {
      console.error('Error applying coupon:', error);
      setCouponError('Erro ao aplicar cupom.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];
  const filteredProducts = selectedCategory === 'Todos' 
    ? products 
    : products.filter(p => p.category === selectedCategory);

  const handleAddFromCart = (product: any) => {
    if (product.addons && product.addons.length > 0) {
      setSelectedProductForAddons(product);
      setSelectedAddons([]);
    } else {
      addItem({
        productId: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        addons: []
      });
    }
  };

  const handleConfirmAddToCartWithAddons = () => {
    if (!selectedProductForAddons) return;
    if (selectedProductForAddons.priceByAddons && selectedAddons.length === 0) return;
    
    addItem({
      productId: selectedProductForAddons.id,
      name: selectedProductForAddons.name,
      price: selectedProductForAddons.priceByAddons ? 0 : selectedProductForAddons.price,
      imageUrl: selectedProductForAddons.imageUrl,
      addons: selectedAddons
    });
    
    setSelectedProductForAddons(null);
    setSelectedAddons([]);
  };

  const handleContinueToCheckout = () => {
    // Check if cart has drinks or desserts
    const hasDrinks = items.some(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.category?.toLowerCase().includes('bebida');
    });
    
    const hasDesserts = items.some(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.category?.toLowerCase().includes('sobremesa') || product?.category?.toLowerCase().includes('doce');
    });

    let suggestions: any[] = [];

    if (!hasDrinks) {
      suggestions = [...suggestions, ...products.filter(p => p.category?.toLowerCase().includes('bebida'))];
    }
    
    if (!hasDesserts) {
      suggestions = [...suggestions, ...products.filter(p => p.category?.toLowerCase().includes('sobremesa') || p.category?.toLowerCase().includes('doce'))];
    }

    if (suggestions.length === 0) {
      // fallback: suggest anything that is not in cart
      suggestions = products.filter(p => !items.some(i => i.productId === p.id));
    }

    if (suggestions.length > 0) {
      // Pick 2 random suggestions
      const randomSuggestions = suggestions.sort(() => 0.5 - Math.random()).slice(0, 2);
      setUpsellSuggestions(randomSuggestions);
      setShowUpsell(true);
    } else {
      setIsCheckingOut(true);
    }
  };

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
          quantity: i.quantity,
          addons: i.addons || []
        })),
        total: total() + deliveryFee,
        subtotal: total(),
        deliveryFee: deliveryFee,
        coupon: coupon ? {
          code: coupon.code,
          discount: coupon.discount,
          type: coupon.type
        } : null,
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
        handleCloseCart();
      }, 3000);
    } catch (error) {
      console.error("Error placing order", error);
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseCart = () => {
    setIsCheckingOut(false);
    setShowUpsell(false);
    toggleCart();
  };

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseCart}></div>
      
      <div className="relative w-full max-w-md bg-darker h-full shadow-2xl flex flex-col border-l border-white/10 animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="font-display text-2xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-accent" />
            {isCheckingOut ? 'Finalizar Pedido' : 'Seu Pedido'}
          </h2>
          <button onClick={handleCloseCart} className="p-2 hover:bg-white/10 rounded-full transition-colors">
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
            <button onClick={handleCloseCart} className="mt-6 text-accent hover:underline">
              Continuar comprando
            </button>
          </div>
        ) : !isCheckingOut && !showUpsell ? (
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

              {/* Adicionar mais itens */}
              <div className="mt-8 pt-6 border-t border-white/10">
                <h4 className="font-display font-bold text-lg mb-4 text-white">Adicionar mais itens</h4>
                
                {/* Categorias */}
                <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide mb-4">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-bold transition-colors ${selectedCategory === category ? 'bg-accent text-dark' : 'bg-white/10 text-white hover:bg-white/20'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>

                {/* Produtos */}
                <div className="space-y-3">
                  {filteredProducts.map(product => (
                    <div key={product.id} className="flex gap-4 bg-white/5 p-3 rounded-xl items-center">
                      <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="w-16 h-16 object-cover rounded-lg" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <h5 className="font-bold text-sm line-clamp-1">{product.name}</h5>
                        <p className="text-accent font-semibold text-sm">R$ {product.price.toFixed(2)}</p>
                      </div>
                      <button 
                        onClick={() => handleAddFromCart(product)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-accent hover:text-dark text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Adicionar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 bg-dark">
              {!storeOpen && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm text-center font-bold">
                  Estamos fechados no momento.<br/>
                  Horário: {storeSettings?.openTime} às {storeSettings?.closeTime}
                </div>
              )}
              
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">Cupom de Desconto</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Digite seu cupom"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-accent uppercase"
                    disabled={applyingCoupon || !!coupon}
                  />
                  {coupon ? (
                    <button
                      onClick={() => {
                        setCoupon(null);
                        setCouponCode('');
                      }}
                      className="px-4 py-2 bg-red-500/20 text-red-400 font-bold rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      Remover
                    </button>
                  ) : (
                    <button
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon || !couponCode}
                      className="px-4 py-2 bg-white/10 text-white font-bold rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
                    >
                      {applyingCoupon ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Aplicar'}
                    </button>
                  )}
                </div>
                {couponError && <p className="text-red-400 text-sm mt-2">{couponError}</p>}
                {coupon && (
                  <p className="text-green-400 text-sm mt-2">
                    Cupom aplicado: {coupon.type === 'fixed' ? `R$ ${coupon.discount.toFixed(2)}` : `${coupon.discount}%`} de desconto
                  </p>
                )}
              </div>

              <div className="flex justify-between items-center mb-6">
                <span className="text-gray-400">Total</span>
                <span className="font-display text-3xl font-bold text-accent">R$ {total().toFixed(2)}</span>
              </div>
              <button 
                onClick={handleContinueToCheckout}
                disabled={!storeOpen}
                className={`w-full py-4 font-bold text-lg rounded-full transition-colors ${storeOpen ? 'bg-accent text-dark hover:bg-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
              >
                Continuar para Entrega
              </button>
            </div>
          </>
        ) : showUpsell ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="text-center mb-8">
                <h3 className="font-display text-2xl font-bold text-accent mb-2">Que tal adicionar?</h3>
                <p className="text-gray-400">Separamos algumas sugestões para completar seu pedido.</p>
              </div>
              
              <div className="space-y-4">
                {upsellSuggestions.map((product) => (
                  <div key={product.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-4">
                    <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="w-24 h-24 object-cover rounded-xl" referrerPolicy="no-referrer" />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-lg">{product.name}</h4>
                        <p className="text-accent font-semibold">R$ {product.price.toFixed(2)}</p>
                      </div>
                      <button 
                        onClick={() => {
                          addItem({
                            productId: product.id,
                            name: product.name,
                            price: product.price,
                            imageUrl: product.imageUrl
                          });
                          // Remove this product from suggestions
                          const newSuggestions = upsellSuggestions.filter(p => p.id !== product.id);
                          setUpsellSuggestions(newSuggestions);
                          if (newSuggestions.length === 0) {
                            setShowUpsell(false);
                            setIsCheckingOut(true);
                          }
                        }}
                        className="mt-2 w-full py-2 bg-white/10 hover:bg-white/20 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Adicionar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-6 border-t border-white/10 bg-dark">
              <button 
                onClick={() => {
                  setShowUpsell(false);
                  setIsCheckingOut(true);
                }}
                className="w-full py-4 bg-accent text-dark font-bold text-lg rounded-full hover:bg-white transition-colors"
              >
                Continuar para Pagamento
              </button>
              <button 
                onClick={() => setShowUpsell(false)}
                className="w-full mt-3 py-3 text-gray-400 font-bold hover:text-white transition-colors"
              >
                Voltar ao Carrinho
              </button>
            </div>
          </div>
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

      {/* ADDONS MODAL INSIDE CART */}
      {selectedProductForAddons && (
        <div className="absolute inset-0 z-[110] bg-darker flex flex-col animate-in slide-in-from-bottom-4 duration-200">
          <div className="p-6 border-b border-white/10 flex justify-between items-center bg-dark">
            <h3 className="font-display font-bold text-xl">Personalizar Pedido</h3>
            <button onClick={() => setSelectedProductForAddons(null)} className="text-gray-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="overflow-y-auto flex-1 p-6">
            <div className="flex gap-4 mb-6">
              <img src={getDisplayImageUrl(selectedProductForAddons.imageUrl)} alt={selectedProductForAddons.name} className="w-20 h-20 object-cover rounded-xl" referrerPolicy="no-referrer" />
              <div>
                <h4 className="font-bold text-lg">{selectedProductForAddons.name}</h4>
                <p className="text-accent font-semibold">R$ {selectedProductForAddons.price.toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col mb-4">
                <h5 className="font-bold text-sm text-gray-400 uppercase tracking-wider">Adicionais Disponíveis</h5>
                {selectedProductForAddons.priceByAddons && (
                  <span className="text-xs text-accent mt-1">Selecione as opções para compor o valor do item.</span>
                )}
              </div>
              {selectedProductForAddons.addons?.map((addon: any, idx: number) => {
                const addonCount = selectedAddons.filter(a => a.name === addon.name).length;
                return (
                  <div key={idx} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${addonCount > 0 ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{addon.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-accent font-semibold">+ R$ {addon.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2 bg-dark rounded-full px-1 py-1">
                        <button 
                          onClick={() => {
                            const index = selectedAddons.findIndex(a => a.name === addon.name);
                            if (index !== -1) {
                              const newAddons = [...selectedAddons];
                              newAddons.splice(index, 1);
                              setSelectedAddons(newAddons);
                            }
                          }}
                          className={`w-6 h-6 flex items-center justify-center rounded-full transition-colors ${addonCount > 0 ? 'hover:bg-white/10 text-white' : 'text-gray-600 cursor-not-allowed'}`}
                          disabled={addonCount === 0}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="font-bold text-sm w-4 text-center">{addonCount}</span>
                        <button 
                          onClick={() => setSelectedAddons([...selectedAddons, addon])}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="p-6 border-t border-white/10 bg-dark">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-400">Total do Item</span>
              <span className="text-2xl font-bold text-accent">
                R$ {(selectedProductForAddons.priceByAddons ? selectedAddons.reduce((sum, a) => sum + a.price, 0) : selectedProductForAddons.price + selectedAddons.reduce((sum, a) => sum + a.price, 0)).toFixed(2)}
              </span>
            </div>
            <button 
              onClick={handleConfirmAddToCartWithAddons}
              disabled={selectedProductForAddons.priceByAddons && selectedAddons.length === 0}
              className={`w-full py-4 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 ${selectedProductForAddons.priceByAddons && selectedAddons.length === 0 ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-accent text-dark hover:bg-white'}`}
            >
              <ShoppingCart className="w-5 h-5" />
              Adicionar ao Carrinho
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
