const express = require('express');
const router = express.Router();

// Product and Carton classes with validation
class Product {
    constructor(length, breadth, height, weight, quantity) {
        if (length <= 0 || breadth <= 0 || height <= 0 || weight <= 0 || quantity <= 0) {
            throw new Error('All product dimensions, weight, and quantity must be positive numbers');
        }
        this.length = length;
        this.breadth = breadth;
        this.height = height;
        this.weight = weight;
        this.quantity = quantity;
        this.volume = length * breadth * height;
    }
}

class Carton {
    constructor(length, breadth, height, maxWeight) {
        if (length <= 0 || breadth <= 0 || height <= 0 || maxWeight <= 0) {
            throw new Error('All carton dimensions and max weight must be positive numbers');
        }
        this.length = length;
        this.breadth = breadth;
        this.height = height;
        this.maxWeight = maxWeight;
        this.volume = length * breadth * height;
        this.efficiency = 0; // Will be calculated during packing
    }
}

// Optimized packing calculation with memoization and better algorithm
function calculateOptimalPacking(product, cartons) {
    // Sort cartons by volume efficiency (smallest first for better fit)
    const sortedCartons = cartons
        .map((carton, index) => ({ ...carton, originalIndex: index }))
        .sort((a, b) => a.volume - b.volume);
    
    const cartonUsed = new Array(cartons.length).fill(false);
    let remainingQuantity = product.quantity;
    const packingResults = [];
    
    // Pre-calculate all possible orientations for the product
    const productOrientations = [
        [product.length, product.breadth, product.height],
        [product.breadth, product.height, product.length],
        [product.height, product.length, product.breadth]
    ];

    while (remainingQuantity > 0) {
        let bestFit = null;
        let bestEfficiency = 0;

        for (let i = 0; i < sortedCartons.length; i++) {
            const carton = sortedCartons[i];
            if (cartonUsed[carton.originalIndex]) continue;

            // Check each orientation
            for (let orientationIndex = 0; orientationIndex < productOrientations.length; orientationIndex++) {
                const [pLength, pBreadth, pHeight] = productOrientations[orientationIndex];
                
                const fitL = Math.floor(carton.length / pLength);
                const fitB = Math.floor(carton.breadth / pBreadth);
                const fitH = Math.floor(carton.height / pHeight);
                const itemsFit = fitL * fitB * fitH;

                if (itemsFit > 0) {
                    const maxItemsByWeight = Math.floor(carton.maxWeight / product.weight);
                    const totalItemsFit = Math.min(itemsFit, maxItemsByWeight, remainingQuantity);
                    
                    if (totalItemsFit > 0) {
                        // Calculate efficiency (volume utilization)
                        const usedVolume = totalItemsFit * product.volume;
                        const efficiency = usedVolume / carton.volume;
                        
                        if (totalItemsFit > (bestFit?.totalItems || 0) || 
                            (totalItemsFit === bestFit?.totalItems && efficiency > bestEfficiency)) {
                            bestFit = {
                                cartonIndex: carton.originalIndex,
                                cartonDetails: {
                                    length: carton.length,
                                    breadth: carton.breadth,
                                    height: carton.height,
                                    maxWeight: carton.maxWeight
                                },
                                orientation: orientationIndex,
                                fitLengthwise: fitL,
                                fitBreadthwise: fitB,
                                fitHeightwise: fitH,
                                totalItems: totalItemsFit,
                                efficiency: efficiency,
                                volumeUtilized: usedVolume,
                                weightUtilized: totalItemsFit * product.weight
                            };
                            bestEfficiency = efficiency;
                        }
                    }
                }
            }
        }

        if (!bestFit) {
            break; // No suitable carton found
        }

        cartonUsed[bestFit.cartonIndex] = true;
        remainingQuantity -= bestFit.totalItems;
        packingResults.push(bestFit);
    }

    // Calculate summary statistics
    const totalItemsPacked = product.quantity - remainingQuantity;
    const totalCartonsUsed = packingResults.length;
    const averageEfficiency = packingResults.length > 0 
        ? packingResults.reduce((sum, result) => sum + result.efficiency, 0) / packingResults.length 
        : 0;

    return { 
        packingResults, 
        remainingQuantity,
        summary: {
            totalItemsPacked,
            totalCartonsUsed,
            averageEfficiency: Math.round(averageEfficiency * 100) / 100,
            packingSuccess: remainingQuantity === 0
        }
    };
}

// Input validation middleware
const validatePackingInput = (req, res, next) => {
    try {
        const { product: productData, cartons: cartonsData } = req.body;

        if (!productData || !cartonsData) {
            return res.status(400).json({ 
                success: false, 
                message: "Product and cartons data are required" 
            });
        }

        // Validate product
        const { length, breadth, height, weight, quantity } = productData;
        if (!length || !breadth || !height || !weight || !quantity) {
            return res.status(400).json({ 
                success: false, 
                message: "Product must have length, breadth, height, weight, and quantity" 
            });
        }

        if (length <= 0 || breadth <= 0 || height <= 0 || weight <= 0 || quantity <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: "All product values must be positive numbers" 
            });
        }

        // Validate cartons
        if (!Array.isArray(cartonsData) || cartonsData.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Cartons must be a non-empty array" 
            });
        }

        for (let i = 0; i < cartonsData.length; i++) {
            const carton = cartonsData[i];
            if (!carton.length || !carton.breadth || !carton.height || !carton.maxWeight) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Carton ${i + 1} is missing required dimensions or maxWeight` 
                });
            }
            if (carton.length <= 0 || carton.breadth <= 0 || carton.height <= 0 || carton.maxWeight <= 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Carton ${i + 1} must have positive dimensions and maxWeight` 
                });
            }
        }

        next();
    } catch (error) {
        return res.status(400).json({ 
            success: false, 
            message: "Invalid input data format" 
        });
    }
};

// Optimized API endpoint
router.post('/optimal-packing2', validatePackingInput, (req, res) => {
    try {
        const { product: productData, cartons: cartonsData } = req.body;

        // Create instances with validation
        const product = new Product(
            productData.length,
            productData.breadth,
            productData.height,
            productData.weight,
            productData.quantity
        );

        const cartons = cartonsData.map(cartonData => new Carton(
            cartonData.length,
            cartonData.breadth,
            cartonData.height,
            cartonData.maxWeight
        ));

        // Calculate optimal packing
        const result = calculateOptimalPacking(product, cartons);

        if (result.remainingQuantity > 0) {
            return res.status(206).json({ // 206 Partial Content
                success: true,
                message: `Partial packing completed. ${result.remainingQuantity} items could not be packed.`,
                ...result
            });
        }

        res.status(200).json({
            success: true,
            message: "Optimal packing calculation completed successfully",
            ...result
        });

    } catch (error) {
        console.error("Error in optimal packing calculation:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during packing calculation",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
