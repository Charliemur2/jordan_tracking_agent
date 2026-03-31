import React from 'react';
import { Plus } from 'lucide-react';

const ProductCard = ({ title, price, image, category }) => {
    return (
        <div className="group bg-white rounded-2xl p-3 hover:shadow-xl transition-all duration-300 border border-gray-100">
            <div className="relative aspect-[4/5] rounded-xl overflow-hidden mb-4 bg-gray-100">
                <img
                    src={image}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <button className="absolute bottom-3 right-3 bg-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg translate-y-12 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 hover:bg-primary hover:text-white">
                    <Plus className="w-5 h-5" />
                </button>
            </div>
            <div className="px-2 pb-2">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">{category}</p>
                <h3 className="text-gray-900 font-medium text-lg leading-tight mb-2 truncate">{title}</h3>
                <p className="text-gray-900 font-bold">${price}</p>
            </div>
        </div>
    );
};

export default ProductCard;
