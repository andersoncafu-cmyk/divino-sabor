import React, { useState } from 'react';
import { Lock, ArrowRight, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '3307') {
      onLogin();
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-6 font-body text-white">
      <div className="max-w-md w-full bg-darker border border-white/10 rounded-3xl p-8 relative overflow-hidden">
        <Link to="/" className="absolute top-6 left-6 text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div className="flex flex-col items-center text-center mb-8 mt-4">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="font-display text-3xl font-bold mb-2">Acesso Restrito</h2>
          <p className="text-gray-400 text-sm">Digite a senha de administrador para continuar.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Senha"
              className={`w-full bg-white/5 border ${error ? 'border-red-500' : 'border-white/10'} rounded-xl px-4 py-4 text-center text-2xl tracking-[0.5em] text-white focus:outline-none focus:border-accent transition-colors`}
              autoFocus
            />
            {error && <p className="text-red-500 text-sm text-center mt-2">Senha incorreta.</p>}
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-accent text-dark font-bold text-lg rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2"
          >
            Entrar <ArrowRight className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
