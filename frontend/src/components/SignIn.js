'use client';

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { HiSparkles } from 'react-icons/hi2';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

// Re-using the AuroraBlob for a consistent look
function AuroraBlob({ delay = 0, color = "indigo", size = "large" }) {
    const sizeClasses = { large: "w-[32rem] h-[32rem]", xlarge: "w-[40rem] h-[40rem]" };
    const colorClasses = { indigo: "bg-gradient-to-br from-indigo-400/30 to-purple-500/20", cyan: "bg-gradient-to-br from-cyan-400/25 to-blue-500/20" };
    return (<motion.div className={`absolute rounded-full blur-3xl ${sizeClasses[size]} ${colorClasses[color]}`} initial={{ scale: 0.5, opacity: 0 }} animate={{ x: [Math.random() * 400 - 200, Math.random() * 600 - 300], y: [Math.random() * 400 - 200, Math.random() * 500 - 250], scale: [0.5, 0.8, 0.9, 0.5], opacity: [0, 0.6, 0.4, 0.7] }} transition={{ duration: 20 + Math.random() * 10, repeat: Infinity, ease: "easeInOut", delay: delay }} />);
}

export default function SignIn() {
    const { signInWithGoogle, currentUser, loading } = useAuth();
    const router = useRouter();

    // Redirect to landing page when user is authenticated
    useEffect(() => {
        if (!loading && currentUser) {
            console.log('[SIGNIN] User authenticated, redirecting to landing page...');
            router.push('/');
        }
    }, [currentUser, loading, router]);

    // If user is already logged in, show loading state while redirecting
    if (currentUser) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="text-white text-xl">Redirecting...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 relative flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
                <AuroraBlob delay={0} color="indigo" size="xlarge" />
                <AuroraBlob delay={2} color="cyan" size="large" />
            </div>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 100, damping: 15 }}
                className="relative z-10 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-10 text-center shadow-2xl max-w-lg w-full"
            >
                <HiSparkles className="h-16 w-16 text-indigo-400 mx-auto mb-6" />
                <h1 className="text-4xl font-black text-white mb-4">Welcome to Agnishakti</h1>

                <p className="text-white/70 mb-8 max-w-sm mx-auto">
                    Sign in to view the live monitoring dashboard and incident reports.
                </p>
                <motion.button
                    onClick={signInWithGoogle}
                    whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(99, 102, 241, 0.3)" }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full flex items-center justify-center space-x-3 bg-white text-slate-800 font-semibold py-4 px-6 rounded-xl transition-all duration-300"
                >
                    <img src="https://www.vectorlogo.zone/logos/google/google-icon.svg" alt="Google icon" className="h-6 w-6" />
                    <span>Sign in with Google</span>
                </motion.button>
            </motion.div>
        </div>
    );
}
