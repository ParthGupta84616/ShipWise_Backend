const express = require('express');
const router = express.Router()

router.use(express.json());

// Global constants
const cm_to_inch = 0.393701;
const ft_to_inch = 12.0;
const g_to_kg = 0.001;
const pounds_to_kg = 0.453592;

// Global inventory array with available quantities
const inventory = [
    { length: 10, breadth: 8, height: 6, weightLimit: 30, quantity: 50 },
    { length: 12, breadth: 10, height: 8, weightLimit: 38, quantity: 40 },
    { length: 14, breadth: 12, height: 10, weightLimit: 46, quantity: 30 },
    { length: 16, breadth: 14, height: 12, weightLimit: 60, quantity: 20 },
    { length: 18, breadth: 16, height: 14, weightLimit: 76, quantity: 10 }
];

// Helper function to convert weight to kg
function convertWeightToKg(weight, unit) {
    switch (unit) {
        case 'g':
            return weight * g_to_kg;
        case 'pounds':
            return weight * pounds_to_kg;
        default:
            return weight; // assume it's in kg
    }
}

// Helper function to convert dimensions to inches
function convertToInches(dims, unit) {
    if (unit === 'cm') {
        dims.length *= cm_to_inch;
        dims.breadth *= cm_to_inch;
        dims.height *= cm_to_inch;
    } else if (unit === 'ft') {
        dims.length *= ft_to_inch;
        dims.breadth *= ft_to_inch;
        dims.height *= ft_to_inch;
    }
    return dims;
}

// API to calculate optimal packing
router.post('/optimal-packing', (req, res) => {
    const { productDimensions, weight, weightUnit, quantity, unit } = req.body;

    if (!productDimensions || !weight || !quantity || !unit) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Convert weight and dimensions to appropriate units
    const productWeight = convertWeightToKg(weight, weightUnit);
    let dims = convertToInches(productDimensions, unit);

    // Packing logic (converted from C++ to JavaScript)
    const packingResult = calculateOptimalPacking(dims, productWeight, quantity);

    if (packingResult.numCartons === -1) {
        return res.status(404).json({ message: 'No suitable carton found' });
    }

    return res.json(packingResult);
});

// Packing algorithm converted to JavaScript
function calculateOptimalPacking(dims, weightPerProduct, quantity) {
    const result = {
        cartonIndex: -1,
        numCartons: Number.MAX_SAFE_INTEGER,
        cartonDistribution: []
    };

    let remainingQuantity = quantity;
    let cartonUsed = Array(inventory.length).fill(false);

    while (remainingQuantity > 0) {
        let bestCartonIndex = -1;
        let bestOrientation = 0;
        let bestFitL = 0, bestFitB = 0, bestFitH = 0, bestWeight = 0, bestProductsPacked = 0;
        let minCartonsNeeded = Number.MAX_SAFE_INTEGER;

        for (let i = 0; i < inventory.length; i++) {
            if (cartonUsed[i] || inventory[i].quantity <= 0) continue;

            for (let o = 1; o <= 3; o++) {
                let numBoxesLengthwise = 0, numBoxesBreadthwise = 0, numBoxesHeightwise = 0;

                if (o === 1) {
                    numBoxesLengthwise = (inventory[i].length - 2) / dims.length;
                    numBoxesBreadthwise = (inventory[i].breadth - 2) / dims.breadth;
                    numBoxesHeightwise = (inventory[i].height - 2) / dims.height;
                } else if (o === 2) {
                    numBoxesLengthwise = (inventory[i].length - 2) / dims.breadth;
                    numBoxesBreadthwise = (inventory[i].breadth - 2) / dims.length;
                    numBoxesHeightwise = (inventory[i].height - 2) / dims.height;
                } else {
                    numBoxesLengthwise = (inventory[i].length - 2) / dims.height;
                    numBoxesBreadthwise = (inventory[i].breadth - 2) / dims.length;
                    numBoxesHeightwise = (inventory[i].height - 2) / dims.breadth;
                }

                if (numBoxesLengthwise <= 0 || numBoxesBreadthwise <= 0 || numBoxesHeightwise <= 0) continue;

                let maxProductsPacked = numBoxesLengthwise * numBoxesBreadthwise * numBoxesHeightwise;
                let totalWeight = weightPerProduct * maxProductsPacked;

                if (totalWeight > inventory[i].weightLimit) {
                    maxProductsPacked--;
                }

                if (maxProductsPacked > 0) {
                    let cartonsNeeded = Math.ceil(remainingQuantity / maxProductsPacked);

                    if (cartonsNeeded < minCartonsNeeded) {
                        minCartonsNeeded = cartonsNeeded;
                        bestCartonIndex = i;
                        bestOrientation = o;
                        bestProductsPacked = maxProductsPacked;
                        bestWeight = totalWeight;
                        bestFitL = numBoxesLengthwise;
                        bestFitB = numBoxesBreadthwise;
                        bestFitH = numBoxesHeightwise;
                    }
                }
            }
        }

        if (bestCartonIndex === -1) {
            return { numCartons: -1 }; // No suitable carton
        }

        let productsHandled = Math.min(remainingQuantity, bestProductsPacked * inventory[bestCartonIndex].quantity);
        let cartonsUsed = Math.ceil(productsHandled / bestProductsPacked);

        result.cartonDistribution.push({ cartonIndex: bestCartonIndex, cartonsUsed });
        remainingQuantity -= cartonsUsed * bestProductsPacked;

        cartonUsed[bestCartonIndex] = true;

        if (result.cartonIndex === -1) {
            result.cartonIndex = bestCartonIndex;
            result.orientation = bestOrientation;
            result.fitLengthwise = bestFitL;
            result.fitBreadthwise = bestFitB;
            result.fitHeightwise = bestFitH;
            result.cartonWeight = bestWeight;
        }
    }

    result.numCartons = result.cartonDistribution.reduce((sum, dist) => sum + dist.cartonsUsed, 0);
    return result;
}

module.exports = router;
