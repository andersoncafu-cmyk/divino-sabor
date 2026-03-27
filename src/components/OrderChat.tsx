import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Send, X, Loader2 } from 'lucide-react';

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

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  isAdmin: boolean;
  createdAt: any;
}

interface OrderChatProps {
  orderId: string;
  onClose: () => void;
  isAdminView: boolean;
}

export default function OrderChat({ orderId, onClose, isAdminView }: OrderChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  const playNotificationSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
      console.error("Audio play failed", e);
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'orders', orderId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
      
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
      } else {
        const newMsgs = snapshot.docChanges().filter(c => c.type === 'added');
        const hasExternal = newMsgs.some(c => c.doc.data().senderId !== auth.currentUser?.uid);
        if (hasExternal) {
          playNotificationSound();
        }
      }

      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });

    return () => unsubscribe();
  }, [orderId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !auth.currentUser) return;

    setSending(true);
    try {
      await addDoc(collection(db, 'orders', orderId, 'messages'), {
        text: newMessage.trim(),
        senderId: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || 'Usuário',
        isAdmin: isAdminView,
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      handleFirestoreError(error, OperationType.CREATE, `orders/${orderId}/messages`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-lg bg-darker h-[80vh] rounded-2xl shadow-2xl flex flex-col border border-white/10 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-dark rounded-t-2xl">
          <h3 className="font-display text-lg font-bold flex items-center gap-2">
            Chat do Pedido
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm">
              <p>Nenhuma mensagem ainda.</p>
              <p>Envie uma mensagem para iniciar o chat!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.senderId === auth.currentUser?.uid;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isMe ? 'bg-accent text-dark rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                    {!isMe && <p className="text-[10px] opacity-70 mb-1 font-bold">{msg.senderName}</p>}
                    <p className="text-sm">{msg.text}</p>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">
                    {msg.createdAt?.toDate().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 border-t border-white/10 bg-dark rounded-b-2xl flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-accent"
          />
          <button 
            type="submit" 
            disabled={!newMessage.trim() || sending}
            className="p-2 bg-accent text-dark rounded-full hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center w-10 h-10"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
