import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import LandingPage from './pages/LandingPage';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if user exists in DB, if not create
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const role = currentUser.email === 'anderson.cafu@gmail.com' ? 'admin' : 'customer';
          await setDoc(userRef, {
            name: currentUser.displayName || 'User',
            email: currentUser.email,
            role: role
          });
          setIsAdmin(role === 'admin');
        } else {
          setIsAdmin(userSnap.data().role === 'admin');
        }
      } else {
        setIsAdmin(false);
        setIsAdminAuthenticated(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage user={user} isAdmin={isAdmin} />} />
        <Route 
          path="/admin" 
          element={
            isAdmin ? (
              isAdminAuthenticated ? <AdminDashboard /> : <AdminLogin onLogin={() => setIsAdminAuthenticated(true)} />
            ) : <Navigate to="/" />
          } 
        />
      </Routes>
    </Router>
  );
}
