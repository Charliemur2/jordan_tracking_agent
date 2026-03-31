import React from 'react';
import { ShoppingBag, Search, Menu } from 'lucide-react';

const Navigation = () => {
    return (
        <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <div className="flex items-center">
                        <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                            Jordan Electronics
                        </span>
                    </div>

                    <div className="hidden md:flex space-x-8 text-sm font-medium text-gray-700">
                        <a href="#" className="hover:text-blue-600 transition-colors">Laptops</a>
                        <a href="#" className="hover:text-blue-600 transition-colors">Smartphones</a>
                        <a href="#" className="hover:text-blue-600 transition-colors">Cameras</a>
                        <a href="#" className="hover:text-blue-600 transition-colors">Gaming</a>
                        <a href="#" className="hover:text-blue-600 transition-colors font-semibold">Support</a>
                    </div>

                    <div className="flex items-center space-x-6 text-gray-600">
                        <Search className="w-5 h-5 hover:text-blue-600 is-clickable transition-colors" />
                        <div className="relative">
                            <ShoppingBag className="w-5 h-5 hover:text-blue-600 is-clickable transition-colors" />
                            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">0</span>
                        </div>
                        <Menu className="w-5 h-5 md:hidden hover:text-blue-600 is-clickable" />
                    </div>
                </div>
            </div>
        </nav>
    );
};

export default Navigation;
