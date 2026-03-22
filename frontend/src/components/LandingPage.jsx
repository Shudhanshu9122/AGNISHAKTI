import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { 
  Shield, 
  Eye, 
  Zap, 
  Bell, 
  Camera, 
  Users, 
  X, 
  MapPin, 
  Phone, 
  Building,
  Lock,
  Mail,
  User,
  Play,
  Pause,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react';
import axios from '../lib/apiClient';
import { useRouter } from 'next/navigation';
import SignIn from './SignIn';

// Video playlist - you can modify these URLs
const VIDEO_PLAYLIST = [
  // "https://www.w3schools.com/html/mov_bbb.mp4", // Sample video 1
  "https://sample-videos.com/zip/10/mp4/480/SampleVideo_1280x720_1mb.mp4", // Sample video 2
  // "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4", // Sample video 3
];

const LandingPage = () => {
  const router = useRouter();
  const [modalState, setModalState] = useState(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const { currentUser, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [providerPassword, setProviderPassword] = useState('');

  
  // Form states (simplified - no longer needed for basic registration)
  const [ownerForm, setOwnerForm] = useState({});
  const [providerForm, setProviderForm] = useState({});
  // useEffect(() => {
  //   if (!loading && currentUser) {
  //     // User is authenticated with Firebase, now check their role in Firestore
  //     checkUserRoleAndRedirect(currentUser.email);
  //   }
  // }, [currentUser, loading]);

  // Video controls
  const nextVideo = () => {
    setCurrentVideoIndex((prev) => (prev + 1) % VIDEO_PLAYLIST.length);
  };

  const togglePlayPause = () => {
    const video = document.getElementById('background-video');
    if (video) {
      if (isVideoPlaying) {
        video.pause();
      } else {
        video.play();
      }
      setIsVideoPlaying(!isVideoPlaying);
    }
  };

  const toggleMute = () => {
    const video = document.getElementById('background-video');
    if (video) {
      video.muted = !isVideoMuted;
      setIsVideoMuted(!isVideoMuted);
    }
  };

  const checkUserRoleAndRedirect = async (email) => {
  try {
    const response = await axios.post('/auth/login', { email });
    const { user } = response.data;
      if (user.role === 'owner') {
        router.push('/owner-dashboard');
    } else if (user.role === 'provider') {
      router.push('/provider/dashboard');
    }
  } catch (err) {
    // User is not registered in Firestore, show the registration modals
    // Only log error if it's not a 404 (user not found)
    if (err.response?.status !== 404) {
      console.error('Error checking user role:', err);
    }
    setModalState('choose-role'); // A new state to prompt role selection
  }
};

  const showToast = (message, type = 'success') => {
    // You can implement a proper toast notification here
    alert(message);
  };

  const handleOwnerRegister = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Starting owner registration for:', currentUser.email);
      console.log('User data:', {
        email: currentUser.email,
        name: currentUser.displayName,
        role: 'owner'
      });
      
      // Register user with basic info only
      const userResponse = await axios.post('/auth/register', {
        email: currentUser.email,
        name: currentUser.displayName,
        role: 'owner'
      });
      
      console.log('User registration response:', userResponse.data);
      
      showToast('Registration successful! Redirecting to dashboard...');
      setModalState(null);
      setOwnerForm({});
      
      // Redirect to owner dashboard
      router.push('/owner-dashboard');
    } catch (err) {
      console.error('Owner registration error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      
      if (err.response?.status === 400) {
        setError(err.response?.data?.error || 'Invalid registration data');
      } else if (err.response?.status === 500) {
        setError('Server error. Please try again later.');
      } else {
        setError(err.response?.data?.error || 'Registration failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

// Replace the old handleProviderRegister function with this
const handleProviderRegister = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    // Hardcoded password for this example
    const CORRECT_PASSWORD = 'password123'; 

    // Check if the entered password is correct
    if (providerPassword !== CORRECT_PASSWORD) {
        setError('Incorrect password. Please try again.');
        // Don't proceed with the registration
        return;
    }

    setIsLoading(true);
    setError('');

    try {
        console.log('Starting provider registration for:', currentUser.email);
        console.log('User data:', {
            email: currentUser.email,
            name: currentUser.displayName,
            role: 'provider'
        });

        const userResponse = await axios.post('/auth/register', {
            email: currentUser.email,
            name: currentUser.displayName,
            role: 'provider'
        });

        console.log('User registration response:', userResponse.data);

        showToast('Registration successful! Redirecting to dashboard...');
        setModalState(null);
        setProviderForm({});

        router.push('/provider/dashboard');
    } catch (err) {
        console.error('Provider registration error:', err);
        console.error('Error response:', err.response?.data);
        console.error('Error status:', err.response?.status);

        if (err.response?.status === 400) {
            setError(err.response?.data?.error || 'Invalid registration data');
        } else if (err.response?.status === 500) {
            setError('Server error. Please try again later.');
        } else {
            setError(err.response?.data?.error || 'Registration failed');
        }
    } finally {
        setIsLoading(false);
    }
};

// In LandingPage.jsx
const handleLogin = async () => {
  // Add a guard clause to prevent multiple calls
  if (isLoading || !currentUser) {
    return;
  }

  setIsLoading(true);
  setError('');

  try {
    const response = await axios.post('/auth/login', { email: currentUser.email });
    const { user } = response.data;
    const { role } = user;
    if (role === 'owner') {
      router.push('/owner-dashboard');
    } else if (role === 'provider') {
      router.push('/provider/dashboard');
    }
  } catch (err) {
    if (err.response?.status === 404) {
      setError('User not found. Please register first.');
      setModalState('choose-role');
    } else {
      setError(err.response?.data?.error || 'Login failed');
    }
  } finally {
    // This is crucial: make sure loading is set to false in all cases.
    setIsLoading(false);
  }
};
 

  // Show SignIn component if needed
  if (showSignIn) {
    return (
      <div className="relative">
        <SignIn />
        <button
          onClick={() => setShowSignIn(false)}
          className="absolute top-4 left-4 z-50 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white hover:bg-white/20 transition-all duration-300 flex items-center gap-2"
        >
          <X className="w-4 h-4" />
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Video */}
      <div className="fixed inset-0 z-0">
        <video
          id="background-video"
          key={currentVideoIndex}
          autoPlay
        //   loop
          muted={isVideoMuted}
          playsInline
          className="w-full h-full object-cover"
          onEnded={nextVideo}
        >
          <source src={VIDEO_PLAYLIST[currentVideoIndex]} type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-slate-900/90 backdrop-blur-[2px]" />
      </div>


      {/* Main Content */}
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-7xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-8"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, delay: 0.2 }}
                className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-md border border-orange-500/30 rounded-full text-orange-300 mb-8"
              >
                <Shield className="w-5 h-5" />
                <span className="text-sm font-medium">AI-Powered Fire Safety System</span>
              </motion.div>
              
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent mb-6 leading-tight">
                Intelligent Fire Safety,
                <br />
                <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">
                  Instant Peace of Mind
                </span>
              </h1>
              
              <p className="text-xl md:text-2xl text-gray-300 max-w-3xl mx-auto mb-12 leading-relaxed">
                Advanced AI monitoring that detects fire hazards in real-time and instantly alerts both 
                property owners and emergency responders for rapid intervention.
              </p>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="flex flex-col md:flex-row gap-6 justify-center items-center"
            >
              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (currentUser) {
                    setModalState('owner-register');
                  } else {
                    setShowSignIn(true);
                  }
                }}
                className="group px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-2xl font-semibold text-lg shadow-2xl hover:shadow-orange-500/25 transition-all duration-300 border border-orange-400/20"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
                  Secure My Property
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (currentUser) {
                    setModalState('provider-register');
                  } else {
                    setShowSignIn(true);
                  }
                }}
                className="group px-8 py-4 bg-white/10 backdrop-blur-md border border-white/20 text-white rounded-2xl font-semibold text-lg hover:bg-white/20 transition-all duration-300 shadow-xl"
              >
                <div className="flex items-center gap-3">
                  <Users className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
                  Join as Responder
                </div>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (currentUser) {
                    handleLogin();
                  } else {
                    setShowSignIn(true);
                  }
                }}
                className="group px-8 py-4 bg-white/5 backdrop-blur-md border border-white/10 text-white rounded-2xl font-semibold text-lg hover:bg-white/10 transition-all duration-300"
              >
                <div className="flex items-center gap-3">
                  <User className="w-6 h-6 group-hover:scale-110 transition-transform duration-300" />
                  {currentUser ? 'Continue to Dashboard' : 'Login'}
                </div>
              </motion.button>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-32 px-4">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className="text-center mb-20"
            >
              <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Why Choose <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">AgniShakti</span>
              </h2>
              <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                Cutting-edge technology meets life-saving emergency response
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  icon: Eye,
                  title: "AI-Powered Detection",
                  description: "Advanced computer vision instantly identifies fire hazards with 99%+ accuracy",
                  color: "from-blue-400 to-cyan-400"
                },
                {
                  icon: Zap,
                  title: "Lightning Fast Alerts",
                  description: "Real-time notifications reach you and emergency services within seconds",
                  color: "from-yellow-400 to-orange-400"
                },
                {
                  icon: Camera,
                  title: "24/7 Monitoring",
                  description: "Continuous surveillance ensures your property is always protected",
                  color: "from-purple-400 to-pink-400"
                },
                {
                  icon: Bell,
                  title: "Smart Integration",
                  description: "Seamlessly connects with fire departments and emergency responders",
                  color: "from-green-400 to-emerald-400"
                }
              ].map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  whileHover={{ y: -10, scale: 1.02 }}
                  className="group relative"
                >
                  <div className="h-full p-8 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl hover:bg-white/10 hover:border-white/20 transition-all duration-500 shadow-2xl">
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.6 }}
                      className={`w-16 h-16 bg-gradient-to-r ${feature.color} rounded-2xl flex items-center justify-center mb-6 shadow-lg`}
                    >
                      <feature.icon className="w-8 h-8 text-white" />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 group-hover:bg-clip-text transition-all duration-300">
                      {feature.title}
                    </h3>
                    <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors duration-300">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalState && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setModalState(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <h2 className="text-2xl font-bold text-white">
                  {modalState === 'owner-register' && 'Secure Your Property'}
                  {modalState === 'provider-register' && 'Join as Responder'}
                  {modalState === 'login' && 'Welcome Back'}
                  {modalState === 'choose-role' && 'Choose Your Role'}
                </h2>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setModalState(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </motion.button>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
                  >
                    {error}
                  </motion.div>
                )}

                {!currentUser ? (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 text-center"
                    >
                        <h3 className="text-xl font-semibold text-white mb-4">You are not logged in.</h3>
                        <p className="text-gray-300 mb-6">Please log in to continue.</p>
                        <button
                        onClick={() => router.push('/signin')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                        Go to Sign In
                        </button>
                    </motion.div>
                    ) : (
                  <>
                    {modalState === 'owner-register' && (
                      <div className="text-center space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Shield className="w-10 h-10 text-white" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">Property Owner Registration</h3>
                          <p className="text-gray-300 mb-2">Email: {currentUser?.email}</p>
                          <p className="text-gray-300 mb-4">Name: {currentUser?.displayName}</p>
                          <p className="text-gray-400 text-sm">You will be registered as a property owner. You can add your property details later in the dashboard.</p>
                        </div>
                        
                        <div className="space-y-3">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleOwnerRegister}
                            disabled={isLoading}
                            className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 disabled:opacity-50 shadow-lg"
                          >
                            {isLoading ? 'Registering...' : 'Register as Property Owner'}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => setModalState('choose-role')}
                            className="w-full px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-all duration-300"
                          >
                            Back to Role Selection
                          </motion.button>
                        </div>
                      </div>
                    )}

                    {modalState === 'provider-register' && (
                      <div className="text-center space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="w-20 h-20 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Users className="w-10 h-10 text-white" />
                          </div>
                          <h3 className="text-xl font-semibold text-white mb-2">Emergency Responder Registration</h3>
                          <p className="text-gray-300 mb-2">Email: {currentUser?.email}</p>
                          <p className="text-gray-300 mb-4">Name: {currentUser?.displayName}</p>
                          <p className="text-gray-400 text-sm">You will be registered as an emergency responder. You can add your station details later in the dashboard.</p>
                        </div>
                        <input
                            type="password"
                            value={providerPassword}
                            onChange={(e) => setProviderPassword(e.target.value)}
                            placeholder="Enter Secret Password"
                            className="w-full px-4 py-3 bg-white/5 rounded-xl border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-300"
                        />
                        <div className="space-y-3">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleProviderRegister}
                            disabled={isLoading}
                            className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 shadow-lg"
                          >
                            {isLoading ? 'Registering...' : 'Register as Emergency Responder'}
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => setModalState('choose-role')}
                            className="w-full px-6 py-3 bg-white/10 text-white rounded-xl font-medium hover:bg-white/20 transition-all duration-300"
                          >
                            Back to Role Selection
                          </motion.button>
                        </div>
                      </div>
                    )}

                    {modalState === 'login' && (
                      <div className="text-center space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="w-20 h-20 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User className="w-10 h-10 text-white" />
                          </div>
                          <p className="text-gray-300 mb-2">Signed in as:</p>
                          <p className="text-white font-semibold text-lg">{currentUser.displayName}</p>
                          <p className="text-gray-400">{currentUser.email}</p>
                        </div>
                        
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleLogin}
                          disabled={isLoading}
                          className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300 disabled:opacity-50 shadow-lg"
                        >
                          {isLoading ? 'Signing In...' : 'Continue to Dashboard'}
                        </motion.button>
                      </div>
                    )}

                    {modalState === 'choose-role' && (
                      <div className="text-center space-y-6">
                        <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
                          <div className="w-20 h-20 bg-gradient-to-r from-orange-400 to-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <User className="w-10 h-10 text-white" />
                          </div>
                          {currentUser ? (
                            <>
                              <p className="text-gray-300 mb-2">Welcome, {currentUser.displayName}!</p>
                              <p className="text-gray-400 mb-4">Please choose your role to continue:</p>
                            </>
                          ) : (
                            <>
                              <p className="text-gray-300 mb-2">Welcome to AgniShakti!</p>
                              <p className="text-gray-400 mb-4">Please sign in first, then choose your role:</p>
                            </>
                          )}
                        </div>
                        
                        {currentUser ? (
                          <div className="space-y-4">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setModalState('owner-register')}
                              className="w-full px-6 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-semibold hover:from-orange-600 hover:to-red-700 transition-all duration-300 shadow-lg flex items-center justify-center gap-3"
                            >
                              <Shield className="w-5 h-5" />
                              Property Owner
                            </motion.button>
                            
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setModalState('provider-register')}
                              className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-purple-700 transition-all duration-300 shadow-lg flex items-center justify-center gap-3"
                            >
                              <Users className="w-5 h-5" />
                              Emergency Responder
                            </motion.button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setShowSignIn(true)}
                              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all duration-300 shadow-lg flex items-center justify-center gap-3"
                            >
                              <User className="w-5 h-5" />
                              Sign In to Continue
                            </motion.button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Video Controls (Mobile) */}
      <motion.div
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 2 }}
        className="fixed bottom-6 right-6 z-50 md:hidden"
      >
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={togglePlayPause}
          className="p-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-full text-white shadow-2xl hover:shadow-orange-500/25 transition-all duration-300"
        >
          {isVideoPlaying ? <Pause size={24} /> : <Play size={24} />}
        </motion.button>
      </motion.div>

      {/* Ambient Particles Effect */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-5">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-orange-400/30 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: window.innerHeight + 10,
            }}
            animate={{
              y: -10,
              x: Math.random() * window.innerWidth,
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 10,
            }}
          />
        ))}
      </div>

      {/* Stats Section */}
      <section className="py-20 px-4 relative z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {[
              { number: "92%", label: "Detection Accuracy", icon: Eye },
              { number: "<3s", label: "Response Time", icon: Zap },
              { number: "24/7", label: "Monitoring", icon: Shield },
              { number: "1000+", label: "Lives Protected", icon: Users },
            ].map((stat, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl hover:bg-white/10 transition-all duration-300"
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                  className="w-12 h-12 bg-gradient-to-r from-orange-400 to-red-500 rounded-xl flex items-center justify-center mx-auto mb-4"
                >
                  <stat.icon className="w-6 h-6 text-white" />
                </motion.div>
                <div className="text-3xl md:text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                  {stat.number}
                </div>
                <div className="text-gray-400 text-sm md:text-base">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 border-t border-white/10 bg-black/20 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <h3 className="text-2xl font-bold text-white mb-2">AgniShakti</h3>
            <p className="text-gray-400">Intelligent Fire Safety for a Safer Tomorrow</p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex justify-center items-center space-x-6 text-gray-400"
          >
            <span>© 2024 AgniShakti. All rights reserved.</span>
            <div className="flex space-x-4">
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-2 h-2 bg-orange-400 rounded-full"
              />
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-2 h-2 bg-red-400 rounded-full"
              />
              <motion.div
                whileHover={{ scale: 1.2 }}
                className="w-2 h-2 bg-yellow-400 rounded-full"
              />
            </div>
          </motion.div>
        </div>
      </footer>

      {/* Toast Notification Container */}
      <div id="toast-container" className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50" />
    </div>
  );
};

export default LandingPage;