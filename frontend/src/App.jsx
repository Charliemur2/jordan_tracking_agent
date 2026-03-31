import React from 'react';
import Navigation from './components/Navigation';
import Hero from './components/Hero';
import ProductCard from './components/ProductCard';
import ChatWidget from './components/ChatWidget';

const products = [
  {
    id: 1,
    title: "UltraBook Pro M3",
    price: 1299,
    category: "Laptops",
    image: "https://images.unsplash.com/photo-1517336714460-4c9889a10af5?auto=format&fit=crop&q=80&w=1000"
  },
  {
    id: 2,
    title: "Jordan Phone 15 Ultra",
    price: 999,
    category: "Smartphones",
    image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&q=80&w=1000"
  },
  {
    id: 3,
    title: "Noise-Cancelling Elite Hub",
    price: 349,
    category: "Audio",
    image: "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&q=80&w=1000"
  },
  {
    id: 4,
    title: "4K Cinema Projector",
    price: 899,
    category: "Home Theater",
    image: "https://images.unsplash.com/photo-1535016120720-40c646bebbfc?auto=format&fit=crop&q=80&w=1000"
  },
  {
    id: 5,
    title: "Alpha Mirrorless Camera",
    price: 2499,
    category: "Photography",
    image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=1000"
  },
  {
    id: 6,
    title: "NextGen Gaming Console",
    price: 499,
    category: "Gaming",
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=1000"
  }
];

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Hero />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Premium Electronics</h2>
            <p className="text-gray-500 mt-1">State-of-the-art tech for your life</p>
          </div>
          <a href="#" className="hidden sm:block text-primary font-medium hover:text-blue-700 transition-colors">
            View All Tech &rarr;
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              {...product}
            />
          ))}
        </div>

        <div className="mt-12 text-center sm:hidden">
          <a href="#" className="text-primary font-medium hover:text-blue-700 transition-colors">
            View All Tech &rarr;
          </a>
        </div>
      </main>

      <footer className="bg-white border-t border-gray-100 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          <p>&copy; 2024 Jordan Electronics. All rights reserved.</p>
        </div>
      </footer>

      <ChatWidget />
    </div>
  );
}

export default App;
