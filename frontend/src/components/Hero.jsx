import React from 'react';

const Hero = () => {
    return (
        <div className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
                <div className="lg:w-1/2">
                    <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6">
                        The Future of <br />
                        <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Premium Tech</span>
                    </h1>
                    <p className="text-lg text-gray-600 mb-8 max-w-lg">
                        Experience the next generation of electronics. From high-performance laptops to professional cameras, we bring you the world's best technology.
                    </p>
                    <div className="flex space-x-4">
                        <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg hover:shadow-blue-500/30">
                            Shop Now
                        </button>
                        <button className="bg-white hover:bg-gray-50 text-gray-900 px-8 py-3 rounded-full font-medium border border-gray-200 transition-all">
                            View Tech Guide
                        </button>
                    </div>
                </div>
            </div>

            {/* Decorative gradient blob */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-1/2 h-full bg-gradient-to-bl from-blue-100 to-indigo-100 rounded-full blur-3xl opacity-60 -z-10 transform rotate-12"></div>
        </div>
    );
};

export default Hero;
