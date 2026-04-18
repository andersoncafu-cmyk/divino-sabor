import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db, signInWithGoogle, logout } from '../firebase';
import { useCartStore } from '../store/cartStore';
import { ShoppingCart, User, LogOut, ShieldAlert, Package, X, Minus, Plus } from 'lucide-react';
import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Cart from '../components/Cart';
import MyOrders from '../components/MyOrders';

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage({ user, isAdmin }: { user: any, isAdmin: boolean }) {
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
  const [products, setProducts] = useState<any[]>([]);
  const { toggleCart, items } = useCartStore();
  const headerRef = useRef<HTMLElement>(null);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [selectedProductForAddons, setSelectedProductForAddons] = useState<any>(null);
  const [selectedAddons, setSelectedAddons] = useState<any[]>([]);

  useEffect(() => {
    // Fetch active products
    const q = query(collection(db, 'products'), where('active', '==', true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(prods);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // GSAP Animations
    const ctx = gsap.context(() => {
      // Header scroll effect
      window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
          headerRef.current?.classList.add('bg-dark/80', 'backdrop-blur-md', 'border-b', 'border-white/10');
        } else {
          headerRef.current?.classList.remove('bg-dark/80', 'backdrop-blur-md', 'border-b', 'border-white/10');
        }
      });

      // Hero animations
      gsap.fromTo('.hero-elem', 
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 1, stagger: 0.2, ease: 'power3.out', delay: 0.2 }
      );

      gsap.to('.hero-bg', {
        scale: 1.1,
        duration: 20,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });

      // Scroll reveals
      gsap.utils.toArray('.reveal').forEach((elem: any) => {
        gsap.fromTo(elem,
          { y: 50, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: elem,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      });
    });

    return () => ctx.revert();
  }, []);

  const handleAddToCart = (product: any) => {
    if (product.addons && product.addons.length > 0) {
      setSelectedProductForAddons(product);
      setSelectedAddons([]);
      return;
    }

    useCartStore.getState().addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
      addons: []
    });
    toggleCart();
  };

  const handleConfirmAddToCartWithAddons = () => {
    if (!selectedProductForAddons) return;
    if (selectedProductForAddons.priceByAddons && selectedAddons.length === 0) return;
    
    useCartStore.getState().addItem({
      productId: selectedProductForAddons.id,
      name: selectedProductForAddons.name,
      price: selectedProductForAddons.priceByAddons ? 0 : selectedProductForAddons.price,
      imageUrl: selectedProductForAddons.imageUrl,
      addons: selectedAddons
    });
    
    setSelectedProductForAddons(null);
    setSelectedAddons([]);
    toggleCart();
  };

  const cartItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-dark text-white font-body overflow-x-hidden selection:bg-accent selection:text-dark">
      {/* HEADER */}
      <header ref={headerRef} className="fixed top-0 left-0 w-full z-50 transition-all duration-300">
        <div className="max-w-7xl mx-auto pl-4 pr-6 md:px-6 h-24 md:h-40 flex items-center justify-between">
          <a href="#" className="flex items-center min-w-0 flex-1">
            <img src="https://lh3.googleusercontent.com/d/1-E1xyd5TgL_j6hHd3jOt1Ivs1VlHTkwI" alt="Império K&T" className="h-16 sm:h-20 md:h-36 object-contain" referrerPolicy="no-referrer" />
          </a>
          <nav className="hidden md:flex gap-8 text-sm font-medium text-gray-300 tracking-wide uppercase">
            <a href="#menu" className="hover:text-accent transition-colors">Cardápio</a>
            <a href="#diferenciais" className="hover:text-accent transition-colors">Diferenciais</a>
            <a href="#sobre" className="hover:text-accent transition-colors">Sobre</a>
          </nav>
          <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
            <button onClick={toggleCart} className="relative p-2 text-white hover:text-accent transition-colors">
              <ShoppingCart className="w-5 h-5 md:w-6 md:h-6" />
              {cartItemCount > 0 && (
                <span className="absolute top-0 right-0 bg-accent text-dark text-[10px] md:text-xs font-bold rounded-full w-4 h-4 md:w-5 md:h-5 flex items-center justify-center transform translate-x-1 -translate-y-1">
                  {cartItemCount}
                </span>
              )}
            </button>
            
            {user ? (
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={() => setIsMyOrdersOpen(true)} className="flex items-center gap-1 md:gap-2 text-xs md:text-sm font-medium text-gray-300 hover:text-white transition-colors">
                  <Package className="w-4 h-4" /> <span className="hidden sm:inline">Meus Pedidos</span>
                </button>
                {isAdmin && (
                  <Link to="/admin" className="hidden md:flex items-center gap-2 text-sm font-medium text-accent hover:text-white transition-colors">
                    <ShieldAlert className="w-4 h-4" /> Admin
                  </Link>
                )}
                <button onClick={logout} className="p-2 text-gray-400 hover:text-white transition-colors" title="Sair">
                  <LogOut className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="inline-flex items-center justify-center px-4 py-2 md:px-6 md:py-2.5 text-xs md:text-sm font-semibold text-dark bg-accent hover:bg-white transition-colors rounded-full">
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center pt-20 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-dark/90 via-dark/60 to-dark z-10"></div>
          <img src="https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=2065&auto=format&fit=crop" alt="Hambúrguer Artesanal" className="w-full h-full object-cover opacity-60 scale-105 hero-bg" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 w-full flex flex-col items-center text-center">
          <div className="inline-block mb-4 px-4 py-1.5 rounded-full glass text-xs font-semibold tracking-widest uppercase text-accent hero-elem">
            A Verdadeira Comunhão do Sabor
          </div>
          <h1 className="font-display font-bold text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tighter mb-6 hero-elem">
            O SABOR QUE <br /> <span className="text-accent-gradient">ALIMENTA A ALMA.</span>
          </h1>
          <p className="max-w-xl text-gray-400 text-lg md:text-xl mb-10 font-light hero-elem">
            Lanches premium, açaí artesanal e bebidas refrescantes. Uma experiência gastronômica inspirada na palavra.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 hero-elem">
            <a href="#menu" className="px-8 py-4 bg-accent text-dark font-semibold rounded-full hover:bg-white transition-all transform hover:scale-105">
              Fazer Pedido
            </a>
          </div>
        </div>
      </section>

      {/* FAIXA DE AUTORIDADE */}
      <div className="py-8 border-y border-white/5 bg-darker overflow-hidden">
        <div className="marquee-container flex items-center">
          <div className="marquee-content flex gap-12 px-6 font-display text-2xl md:text-4xl font-bold text-white/5 uppercase tracking-wider">
            <span>Ingredientes Premium</span>
            <span>•</span>
            <span>Atendimento Abençoado</span>
            <span>•</span>
            <span>Sabor Divino</span>
            <span>•</span>
            <span>Açaí Puro</span>
            <span>•</span>
            <span>Ingredientes Premium</span>
            <span>•</span>
            <span>Atendimento Abençoado</span>
            <span>•</span>
            <span>Sabor Divino</span>
            <span>•</span>
            <span>Açaí Puro</span>
          </div>
        </div>
      </div>

      {/* DIFERENCIAIS (BENTO GRID) */}
      <section id="diferenciais" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20 reveal">
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tighter mb-4">A NOSSA <span className="text-accent">ESSÊNCIA</span></h2>
            <h3 className="font-display text-2xl text-white font-bold mb-4">Sua mesa, nosso propósito</h3>
            <p className="text-gray-400 max-w-3xl mx-auto leading-relaxed">No momento, nossa hamburgueria atende exclusivamente por delivery, levando até você lanches feitos com carinho, qualidade e inspiração. Queremos que cada pedido seja mais do que uma refeição: um momento de comunhão, alegria e sabor para compartilhar com a família e os amigos no conforto do seu lar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
            {/* Item 1 */}
            <div className="md:col-span-2 glass rounded-3xl p-8 relative overflow-hidden group reveal">
              <div className="absolute inset-0 bg-gradient-to-t from-dark to-transparent z-10"></div>
              <img src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=1999&auto=format&fit=crop" alt="Burger" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-50" />
              <div className="relative z-20 h-full flex flex-col justify-end">
                <h3 className="font-display text-3xl font-bold mb-2">O Golias</h3>
                <p className="text-gray-300">Nosso blend especial de 200g que derruba qualquer fome. Preparado na brasa.</p>
              </div>
            </div>

            {/* Item 2 */}
            <div className="glass rounded-3xl p-8 relative overflow-hidden group reveal">
              <div className="absolute inset-0 bg-gradient-to-t from-dark to-transparent z-10"></div>
              <img src="https://lh3.googleusercontent.com/d/1x9HqSttyXA5_fJ0l_5qLOPsGnN98iX5-" alt="Açaí" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-50" referrerPolicy="no-referrer" />
              <div className="relative z-20 h-full flex flex-col justify-end">
                <h3 className="font-display text-2xl font-bold mb-2">Maná do Céu</h3>
                <p className="text-gray-300 text-sm">Açaí puro, cremoso e revigorante.</p>
              </div>
            </div>

            {/* Item 3 */}
            <div className="glass rounded-3xl p-8 relative overflow-hidden group reveal">
              <div className="absolute inset-0 bg-gradient-to-t from-dark to-transparent z-10"></div>
              <img src="https://images.unsplash.com/photo-1622483767028-3f66f32aef97?q=80&w=2070&auto=format&fit=crop" alt="Bebidas" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-50" />
              <div className="relative z-20 h-full flex flex-col justify-end">
                <h3 className="font-display text-2xl font-bold mb-2">Rio Jordão</h3>
                <p className="text-gray-300 text-sm">Refrigerantes e sucos naturais refrescantes.</p>
              </div>
            </div>

            {/* Item 4 */}
            <div className="md:col-span-2 glass rounded-3xl p-8 relative overflow-hidden group reveal flex items-center justify-center bg-darker min-h-[300px]">
              <div className="absolute inset-0 bg-gradient-to-t from-dark via-dark/80 to-transparent z-10"></div>
              <img src="https://lh3.googleusercontent.com/d/1yLHTlkEUVADTgL9-gLirQr-sXT2KdxHH" alt="Delivery Rápido" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-40" referrerPolicy="no-referrer" />
              <div className="relative z-20 text-center">
                <h3 className="font-display text-3xl md:text-4xl font-bold mb-4">Delivery Rápido</h3>
                <p className="text-gray-400 max-w-md mx-auto">Levamos o melhor sabor direto para a sua mesa, com agilidade e mantendo a qualidade e o carinho que você merece.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MENU DESTAQUES */}
      <section id="menu" className="py-32 bg-darker relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-16 reveal">
            <div>
              <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tighter mb-4">CARDÁPIO <span className="text-accent">SAGRADO</span></h2>
              <p className="text-gray-400">Os favoritos da nossa congregação.</p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              <p>O cardápio está sendo preparado. Volte em breve!</p>
            </div>
          ) : (
            <div className="space-y-20">
              {Object.entries(
                products.reduce((acc, product) => {
                  const category = product.category || 'Outros';
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(product);
                  return acc;
                }, {} as Record<string, any[]>)
              ).map(([category, items]) => (
                <div key={category}>
                  <h3 className="font-display text-3xl font-bold mb-8 capitalize border-b border-white/10 pb-4 text-white">
                    {category}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    {(items as any[]).map((product) => (
                      <div key={product.id} className="flex items-center gap-6 p-4 rounded-2xl hover:bg-white/5 transition-colors group reveal">
                        <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="w-24 h-24 rounded-xl object-cover" referrerPolicy="no-referrer" />
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <h4 className="font-display text-xl font-bold group-hover:text-accent transition-colors">{product.name}</h4>
                            </div>
                            <span className="text-accent font-bold whitespace-nowrap">R$ {product.price.toFixed(2)}</span>
                          </div>
                          <p className="text-sm text-gray-400 mb-3 line-clamp-2">{product.description}</p>
                          <button 
                            onClick={() => handleAddToCart(product)}
                            className="text-xs font-semibold uppercase tracking-wider bg-white/10 hover:bg-accent hover:text-dark px-4 py-2 rounded-full transition-colors"
                          >
                            Adicionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <a href="#" className="inline-block mb-6">
            <img src="https://lh3.googleusercontent.com/d/1-E1xyd5TgL_j6hHd3jOt1Ivs1VlHTkwI" alt="Império K&T" className="h-32 md:h-48 object-contain mx-auto" referrerPolicy="no-referrer" />
          </a>
          <p className="text-gray-500 text-sm">
            © 2026 Império K&T. Todos os direitos reservados.
          </p>
        </div>
      </footer>

      {/* CART SIDEBAR */}
      <Cart />

      {/* MY ORDERS SIDEBAR */}
      {isMyOrdersOpen && <MyOrders onClose={() => setIsMyOrdersOpen(false)} />}

      {/* ADDONS MODAL */}
      {selectedProductForAddons && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedProductForAddons(null)}></div>
          <div className="relative bg-darker border border-white/10 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
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
                {selectedProductForAddons.addons.map((addon: any, idx: number) => {
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
                            className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-colors"
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
        </div>
      )}
    </div>
  );
}
