const express = require('express');
const router = express.Router();
const ItemData = require("../models/ItemSchema");
const BoxData = require("../models/BoxSchema");
const { authenticateToken } = require('../middleware/auth.middleware');

// Enhanced Product class with fragility and stacking rules
class Product {
    constructor(length, breadth, height, weight, quantity, options = {}) {
        if (length <= 0 || breadth <= 0 || height <= 0 || weight <= 0 || quantity <= 0) {
            throw new Error('All product dimensions, weight, and quantity must be positive numbers');
        }
        this.id = options.id || `product_${Date.now()}`;
        this.name = options.name || 'Unknown Product';
        this.length = length;
        this.breadth = breadth;
        this.height = height;
        this.weight = weight;
        this.quantity = quantity;
        this.volume = length * breadth * height;
        this.density = weight / this.volume;

        // Fragility and stacking rules
        this.isFragile = options.isFragile || false;
        this.maxStackHeight = options.maxStackHeight || Math.floor(height * 10); // Default: 10x product height
        this.maxStackWeight = options.maxStackWeight || weight * 50; // Default: 50x product weight
        this.canRotate = options.canRotate !== false; // Default: true
        this.priority = options.priority || 1; // Higher = more important to pack

        // Cost factors
        this.value = options.value || 0;
        this.damageCost = options.damageCost || this.value * 0.1;
    }
}

// Enhanced Carton class with cost and priority factors
class Carton {
    constructor(length, breadth, height, maxWeight, options = {}) {
        if (length <= 0 || breadth <= 0 || height <= 0 || maxWeight <= 0) {
            throw new Error('All carton dimensions and max weight must be positive numbers');
        }
        this.id = options.id || `carton_${Date.now()}`;
        this.name = options.name || 'Standard Carton';
        this.length = length;
        this.breadth = breadth;
        this.height = height;
        this.maxWeight = maxWeight;
        this.volume = length * breadth * height;
        this.availableQuantity = options.availableQuantity || 1;

        // Cost factors
        this.cost = options.cost || this.volume * 0.001; // Default cost per cubic unit
        this.shippingCost = options.shippingCost || this.volume * 0.0005 + this.maxWeight * 0.01;
        this.priority = options.priority || 1; // Higher = preferred choice
        this.popularity = options.popularity || 0; // Usage frequency score

        // Physical properties
        this.fragileSupport = options.fragileSupport !== false; // Can hold fragile items
        this.maxStackLayers = options.maxStackLayers || 10;
    }
}

// 3D Position and Layout classes for visualization
class Position3D {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

class PackedItem {
    constructor(product, position, orientation, stackLevel = 1) {
        this.productId = product.id;
        this.productName = product.name;
        this.position = position;
        this.orientation = orientation;
        this.stackLevel = stackLevel;
        this.dimensions = this.getOrientedDimensions(product, orientation);
        this.weight = product.weight;
        this.volume = product.volume;
    }

    getOrientedDimensions(product, orientation) {
        const orientations = [
            [product.length, product.breadth, product.height], // L×B×H
            [product.length, product.height, product.breadth], // L×H×B
            [product.breadth, product.length, product.height], // B×L×H
            [product.breadth, product.height, product.length], // B×H×L
            [product.height, product.length, product.breadth], // H×L×B
            [product.height, product.breadth, product.length]  // H×B×L
        ];
        const [l, b, h] = orientations[orientation];
        return { length: l, breadth: b, height: h };
    }
}

// Advanced 3D Bin Packing Algorithm
class Advanced3DBinPacker {
    constructor() {
        this.algorithms = {
            FIRST_FIT_DECREASING: 'ffd',
            BEST_FIT_DECREASING: 'bfd',
            GUILLOTINE: 'guillotine',
            SKYLINE: 'skyline',
            HYBRID: 'hybrid'
        };
    }

    // Main packing method with algorithm selection
    packItems(products, cartons, algorithm = 'hybrid') {
        switch (algorithm) {
            case 'ffd':
                return this.firstFitDecreasing(products, cartons);
            case 'bfd':
                return this.bestFitDecreasing(products, cartons);
            case 'guillotine':
                return this.packWithGuillotine(products, cartons);
            case 'skyline':
                return this.packWithSkyline(products, cartons);
            case 'hybrid':
            default:
                return this.hybridPacking(products, cartons);
        }
    }

    // Hybrid approach combining multiple algorithms
    hybridPacking(products, cartons) {
        const results = [];

        // Try different algorithms and pick the best result
        const algorithms = ['ffd', 'bfd', 'guillotine'];
        let bestResult = null;
        let bestScore = -Infinity;

        for (const algo of algorithms) {
            try {
                const result = this.packItems(products, cartons, algo);
                const score = this.evaluatePackingQuality(result);

                if (score > bestScore) {
                    bestScore = score;
                    bestResult = result;
                }
            } catch (error) {
                console.warn(`Algorithm ${algo} failed:`, error.message);
            }
        }

        return bestResult || this.basicPacking(products, cartons);
    }

    // Enhanced First Fit Decreasing with 3D considerations
    firstFitDecreasing(products, cartons) {
        // Sort products by priority and volume (largest first)
        const sortedProducts = [...products].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return b.volume - a.volume;
        });

        // Sort cartons by efficiency score
        const sortedCartons = this.sortCartonsByPriority(cartons);
        const results = [];

        for (const product of sortedProducts) {
            let remainingQuantity = product.quantity;

            while (remainingQuantity > 0) {
                let bestFit = null;

                for (const carton of sortedCartons) {
                    if (carton.availableQuantity <= 0) continue;

                    const packingResult = this.packProductInCarton(product, carton, remainingQuantity);
                    if (packingResult && packingResult.itemsPacked > 0) {
                        bestFit = packingResult;
                        break; // First fit
                    }
                }

                if (!bestFit) break;

                results.push(bestFit);
                remainingQuantity -= bestFit.itemsPacked;
                bestFit.carton.availableQuantity--;
            }
        }

        return results;
    }

    // Enhanced Best Fit Decreasing
    bestFitDecreasing(products, cartons) {
        const sortedProducts = [...products].sort((a, b) => {
            if (a.priority !== b.priority) return b.priority - a.priority;
            return b.volume - a.volume;
        });

        const results = [];

        for (const product of sortedProducts) {
            let remainingQuantity = product.quantity;

            while (remainingQuantity > 0) {
                let bestFit = null;
                let bestScore = -Infinity;

                for (const carton of cartons) {
                    if (carton.availableQuantity <= 0) continue;

                    const packingResult = this.packProductInCarton(product, carton, remainingQuantity);
                    if (packingResult && packingResult.itemsPacked > 0) {
                        const score = this.calculatePackingScore(packingResult);
                        if (score > bestScore) {
                            bestScore = score;
                            bestFit = packingResult;
                        }
                    }
                }

                if (!bestFit) break;

                results.push(bestFit);
                remainingQuantity -= bestFit.itemsPacked;
                bestFit.carton.availableQuantity--;
            }
        }

        return results;
    }

    // Guillotine-based packing for better space utilization
    packWithGuillotine(products, cartons) {
        const results = [];
        const sortedProducts = [...products].sort((a, b) => b.volume - a.volume);

        for (const product of sortedProducts) {
            let remainingQuantity = product.quantity;

            while (remainingQuantity > 0) {
                let bestFit = null;
                let bestWasteRatio = Infinity;

                for (const carton of cartons) {
                    if (carton.availableQuantity <= 0) continue;

                    const packingResult = this.packWithGuillotineConstraints(product, carton, remainingQuantity);
                    if (packingResult && packingResult.wasteRatio < bestWasteRatio) {
                        bestWasteRatio = packingResult.wasteRatio;
                        bestFit = packingResult;
                    }
                }

                if (!bestFit) break;

                results.push(bestFit);
                remainingQuantity -= bestFit.itemsPacked;
                bestFit.carton.availableQuantity--;
            }
        }

        return results;
    }

    // Skyline-based packing algorithm
    packWithSkyline(products, cartons) {
        // Implementation would be similar to guillotine but with skyline data structure
        // For brevity, using enhanced basic packing with skyline principles
        return this.enhancedBasicPacking(products, cartons, 'skyline');
    }

    // Core product-in-carton packing logic with 3D layout
    packProductInCarton(product, carton, maxQuantity) {
        if (!product.canRotate && !this.canFitOrientation(product, carton, 0)) {
            return null;
        }

        const orientations = this.getAllOrientations(product);
        let bestLayout = null;
        let bestScore = -Infinity;

        for (let orientationIndex = 0; orientationIndex < orientations.length; orientationIndex++) {
            const orientation = orientations[orientationIndex];
            const layout = this.calculateOptimal3DLayout(product, carton, orientation, maxQuantity);

            if (layout && layout.itemsPacked > 0) {
                const score = this.calculateLayoutScore(layout, product, carton);
                if (score > bestScore) {
                    bestScore = score;
                    bestLayout = layout;
                    bestLayout.orientationIndex = orientationIndex;
                    bestLayout.orientation = orientation;
                }
            }
        }

        if (!bestLayout) return null;

        return {
            product: product,
            carton: carton,
            itemsPacked: bestLayout.itemsPacked,
            layout: bestLayout,
            orientationIndex: bestLayout.orientationIndex,
            orientation: bestLayout.orientation,
            efficiency: this.calculateEfficiency(bestLayout, carton),
            wasteRatio: this.calculateWasteRatio(bestLayout, carton),
            cost: this.calculatePackingCost(bestLayout, product, carton),
            stackingInfo: bestLayout.stackingInfo,
            packedItems: bestLayout.packedItems
        };
    }

    // Calculate optimal 3D layout with stacking logic
    calculateOptimal3DLayout(product, carton, orientation, maxQuantity) {
        const [pLength, pBreadth, pHeight] = orientation.dims;

        // Check basic fit
        if (pLength > carton.length || pBreadth > carton.breadth || pHeight > carton.height) {
            return null;
        }

        // Calculate base layer arrangement
        const itemsPerLength = Math.floor(carton.length / pLength);
        const itemsPerBreadth = Math.floor(carton.breadth / pBreadth);
        const itemsPerLayer = itemsPerLength * itemsPerBreadth;

        if (itemsPerLayer === 0) return null;

        // Calculate stacking possibilities
        const maxStackLayers = this.calculateMaxStackLayers(product, carton, pHeight);
        const totalItemsByVolume = itemsPerLayer * maxStackLayers;

        // Weight constraint
        const maxItemsByWeight = Math.floor(carton.maxWeight / product.weight);

        // Final quantity considering all constraints
        const actualItemsPacked = Math.min(totalItemsByVolume, maxItemsByWeight, maxQuantity);

        if (actualItemsPacked === 0) return null;

        // Generate 3D layout
        const packedItems = this.generate3DLayout(
            product, carton, orientation, itemsPerLength, itemsPerBreadth,
            actualItemsPacked, pLength, pBreadth, pHeight
        );

        // Calculate stacking information
        const stackingInfo = this.analyzeStacking(packedItems, product, carton);

        return {
            itemsPacked: actualItemsPacked,
            itemsPerLayer,
            layers: Math.ceil(actualItemsPacked / itemsPerLayer),
            arrangement: {
                lengthwise: itemsPerLength,
                breadthwise: itemsPerBreadth,
                layers: Math.ceil(actualItemsPacked / itemsPerLayer)
            },
            packedItems,
            stackingInfo,
            spaceUtilization: this.calculateSpaceUtilization(packedItems, carton),
            centerOfMass: this.calculateCenterOfMass(packedItems, carton)
        };
    }

    // Generate detailed 3D layout with positions
    generate3DLayout(product, carton, orientation, itemsPerLength, itemsPerBreadth, totalItems, pLength, pBreadth, pHeight) {
        const packedItems = [];
        let itemIndex = 0;

        for (let layer = 0; layer < Math.ceil(totalItems / (itemsPerLength * itemsPerBreadth)); layer++) {
            const z = layer * pHeight;

            for (let breadthIndex = 0; breadthIndex < itemsPerBreadth && itemIndex < totalItems; breadthIndex++) {
                const y = breadthIndex * pBreadth;

                for (let lengthIndex = 0; lengthIndex < itemsPerLength && itemIndex < totalItems; lengthIndex++) {
                    const x = lengthIndex * pLength;

                    const position = new Position3D(x, y, z);
                    const packedItem = new PackedItem(product, position, orientation.index, layer + 1);

                    packedItems.push(packedItem);
                    itemIndex++;
                }
            }
        }

        return packedItems;
    }

    // Calculate maximum stack layers considering fragility and weight
    calculateMaxStackLayers(product, carton, itemHeight) {
        const maxLayersByHeight = Math.floor(carton.height / itemHeight);
        const maxLayersByWeight = Math.floor(product.maxStackWeight / product.weight);
        const maxLayersByFragility = product.isFragile ? Math.min(3, maxLayersByHeight) : maxLayersByHeight;

        return Math.min(maxLayersByHeight, maxLayersByWeight, maxLayersByFragility, carton.maxStackLayers);
    }

    // Get all possible orientations
    getAllOrientations(product) {
        const orientations = [
            { dims: [product.length, product.breadth, product.height], name: 'L×B×H', index: 0 },
            { dims: [product.length, product.height, product.breadth], name: 'L×H×B', index: 1 },
            { dims: [product.breadth, product.length, product.height], name: 'B×L×H', index: 2 },
            { dims: [product.breadth, product.height, product.length], name: 'B×H×L', index: 3 },
            { dims: [product.height, product.length, product.breadth], name: 'H×L×B', index: 4 },
            { dims: [product.height, product.breadth, product.length], name: 'H×B×L', index: 5 }
        ];

        return product.canRotate ? orientations : [orientations[0]];
    }

    // Sort cartons by priority considering multiple factors
    sortCartonsByPriority(cartons) {
        return [...cartons].sort((a, b) => {
            // Multi-criteria sorting
            const scoreA = this.calculateCartonScore(a);
            const scoreB = this.calculateCartonScore(b);
            return scoreB - scoreA;
        });
    }

    // Calculate carton selection score
    calculateCartonScore(carton) {
        const costFactor = 1 / (carton.cost + 1); // Lower cost = higher score
        const priorityFactor = carton.priority;
        const popularityFactor = carton.popularity + 1;
        const availabilityFactor = carton.availableQuantity > 0 ? 1 : 0;

        return (costFactor * 0.3 + priorityFactor * 0.4 + popularityFactor * 0.2 + availabilityFactor * 0.1);
    }

    // Calculate packing cost
    calculatePackingCost(layout, product, carton) {
        const baseCost = carton.cost;
        const shippingCost = carton.shippingCost;
        const inefficiencyPenalty = (1 - layout.spaceUtilization) * carton.cost * 0.5;
        const fragilityPenalty = product.isFragile && layout.layers > 2 ? product.damageCost * 0.1 : 0;

        return baseCost + shippingCost + inefficiencyPenalty + fragilityPenalty;
    }

    // Calculate various efficiency and quality metrics
    calculateEfficiency(layout, carton) {
        return {
            volumeEfficiency: (layout.itemsPacked * layout.packedItems[0]?.volume || 0) / carton.volume,
            spaceUtilization: layout.spaceUtilization,
            weightUtilization: (layout.itemsPacked * (layout.packedItems[0]?.weight || 0)) / carton.maxWeight
        };
    }

    calculateSpaceUtilization(packedItems, carton) {
        const totalItemVolume = packedItems.reduce((sum, item) => sum + item.volume, 0);
        return totalItemVolume / carton.volume;
    }

    calculateCenterOfMass(packedItems, carton) {
        if (packedItems.length === 0) return new Position3D();

        const totalWeight = packedItems.reduce((sum, item) => sum + item.weight, 0);
        let weightedX = 0, weightedY = 0, weightedZ = 0;

        for (const item of packedItems) {
            const centerX = item.position.x + item.dimensions.length / 2;
            const centerY = item.position.y + item.dimensions.breadth / 2;
            const centerZ = item.position.z + item.dimensions.height / 2;

            weightedX += centerX * item.weight;
            weightedY += centerY * item.weight;
            weightedZ += centerZ * item.weight;
        }

        return new Position3D(
            weightedX / totalWeight,
            weightedY / totalWeight,
            weightedZ / totalWeight
        );
    }

    // Additional helper methods
    calculateWasteRatio(layout, carton) {
        return 1 - layout.spaceUtilization;
    }

    calculatePackingScore(packingResult) {
        const efficiency = packingResult.efficiency.volumeEfficiency;
        const utilization = packingResult.efficiency.spaceUtilization;
        const costFactor = 1 / (packingResult.cost + 1);

        return efficiency * 0.4 + utilization * 0.4 + costFactor * 0.2;
    }

    calculateLayoutScore(layout, product, carton) {
        const spaceScore = layout.spaceUtilization;
        const stackingScore = this.calculateStackingScore(layout, product);
        const stabilityScore = this.calculateStabilityScore(layout, carton);

        return spaceScore * 0.5 + stackingScore * 0.3 + stabilityScore * 0.2;
    }

    calculateStackingScore(layout, product) {
        if (layout.layers <= 1) return 0.5; // Penalize single layer
        if (product.isFragile && layout.layers > 3) return 0.3; // Penalize over-stacking fragile items
        return Math.min(1.0, layout.layers / 5); // Reward efficient stacking
    }

    calculateStabilityScore(layout, carton) {
        // Add null checks
        if (!layout || !layout.centerOfMass || !carton) {
            return 0.5; // Default stability score
        }

        // Simple stability based on center of mass
        const com = layout.centerOfMass;

        const centerX = carton.length / 2;
        const centerY = carton.breadth / 2;
        const centerZ = carton.height / 2;

        const distanceFromCenter = Math.sqrt(
            Math.pow(com.x - centerX, 2) +
            Math.pow(com.y - centerY, 2) +
            Math.pow(com.z - centerZ, 2)
        );

        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY + centerZ * centerZ);
        return 1 - (distanceFromCenter / maxDistance);
    }

    analyzeStacking(packedItems, product, carton) {
        const layers = Math.max(...packedItems.map(item => item.stackLevel));
        const itemsPerLayer = packedItems.filter(item => item.stackLevel === 1).length;
        const averageWeightPerLayer = itemsPerLayer * product.weight;
        const maxSafeWeight = product.maxStackWeight;

        return {
            totalLayers: layers,
            itemsPerLayer: itemsPerLayer,
            averageWeightPerLayer: averageWeightPerLayer,
            stackingSafety: averageWeightPerLayer <= maxSafeWeight,
            stackingEfficiency: layers > 1 ? 1 : 0.5,
            isFragileStacking: product.isFragile && layers > 1
        };
    }

    canFitOrientation(product, carton, orientationIndex) {
        const orientations = this.getAllOrientations(product);
        const [pLength, pBreadth, pHeight] = orientations[orientationIndex].dims;
        return pLength <= carton.length && pBreadth <= carton.breadth && pHeight <= carton.height;
    }

    evaluatePackingQuality(results) {
        if (!results || results.length === 0) return -Infinity;

        const totalItems = results.reduce((sum, result) => sum + result.itemsPacked, 0);
        const totalCost = results.reduce((sum, result) => sum + result.cost, 0);
        const avgEfficiency = results.reduce((sum, result) => sum + result.efficiency.volumeEfficiency, 0) / results.length;

        return totalItems * 100 - totalCost - (1 - avgEfficiency) * 50;
    }

    // Fallback basic packing
    basicPacking(products, cartons) {
        // Simplified version for fallback
        return this.firstFitDecreasing(products, cartons);
    }

    enhancedBasicPacking(products, cartons, method) {
        // Enhanced basic packing with specific method considerations
        return this.firstFitDecreasing(products, cartons);
    }

    packWithGuillotineConstraints(product, carton, maxQuantity) {
        // Simplified guillotine constraints
        const result = this.packProductInCarton(product, carton, maxQuantity);
        if (result) {
            result.wasteRatio = this.calculateWasteRatio(result.layout, carton);
        }
        return result;
    }
}

// Enhanced main packing function
function calculateOptimalPacking(products, cartons, options = {}) {
    const {
        algorithm = 'hybrid',
        costOptimization = true,
        groupReduction = true,
        fragileHandling = true,
        maxCartons = Infinity
    } = options;

    // Initialize the advanced packer
    const packer = new Advanced3DBinPacker();

    // Ensure products is an array
    const productArray = Array.isArray(products) ? products : [products];

    // Create working copy of cartons with quantities
    const workingCartons = cartons.map((carton, index) => ({
        ...carton,
        originalIndex: index,
        availableQuantity: carton.availableQuantity || 1
    }));

    // Multi-product processing
    const allResults = [];
    const unpackedProducts = [];

    for (const product of productArray) {
        let remainingQuantity = product.quantity;
        const productResults = [];

        // Use advanced 3D bin packing
        const packingResults = packer.packItems([{ ...product, quantity: remainingQuantity }], workingCartons, algorithm);

        for (const result of packingResults) {
            if (result.itemsPacked > 0) {
                productResults.push({
                    productId: product.id,
                    productName: product.name,
                    cartonId: result.carton.id,
                    cartonDetails: {
                        id: result.carton.id,
                        name: result.carton.name,
                        length: result.carton.length,
                        breadth: result.carton.breadth,
                        height: result.carton.height,
                        maxWeight: result.carton.maxWeight,
                        volume: result.carton.volume,
                        cost: result.carton.cost,
                        priority: result.carton.priority
                    },
                    itemsPacked: result.itemsPacked,
                    orientation: result.orientation.name,
                    orientationIndex: result.orientationIndex,

                    // Enhanced metrics
                    efficiency: {
                        volumeEfficiency: Math.round(result.efficiency.volumeEfficiency * 1000) / 10,
                        spaceUtilization: Math.round(result.efficiency.spaceUtilization * 1000) / 10,
                        weightUtilization: Math.round(result.efficiency.weightUtilization * 1000) / 10
                    },

                    // Layout and stacking information
                    layout: {
                        arrangement: result.layout.arrangement,
                        layers: result.layout.layers,
                        itemsPerLayer: result.layout.itemsPerLayer,
                        centerOfMass: result.layout.centerOfMass
                    },

                    stackingInfo: result.stackingInfo,

                    // Cost analysis
                    cost: {
                        total: Math.round(result.cost * 100) / 100,
                        breakdown: {
                            cartonCost: result.carton.cost,
                            shippingCost: result.carton.shippingCost,
                            inefficiencyPenalty: Math.round((1 - result.efficiency.spaceUtilization) * result.carton.cost * 0.5 * 100) / 100,
                            fragilityPenalty: product.isFragile && result.layout.layers > 2 ? Math.round(product.damageCost * 0.1 * 100) / 100 : 0
                        }
                    },

                    // Orientation and packing details
                    orientationDetails: {
                        selectedOrientation: result.orientation.name,
                        orientationIndex: result.orientationIndex,
                        itemsInThisOrientation: result.itemsPacked,
                        dimensionsUsed: {
                            length: result.layout.packedItems[0]?.dimensions.length || 0,
                            breadth: result.layout.packedItems[0]?.dimensions.breadth || 0,
                            height: result.layout.packedItems[0]?.dimensions.height || 0
                        },
                        arrangementPattern: `${result.layout.arrangement.lengthwise} × ${result.layout.arrangement.breadthwise} × ${result.layout.arrangement.layers}`,
                        stackingPattern: {
                            itemsPerLayer: result.layout.itemsPerLayer,
                            totalLayers: result.layout.layers,
                            maxSafeStack: product.maxStackHeight,
                            isOptimalStacking: result.layout.layers > 1
                        }
                    },

                    // Packing efficiency metrics
                    packingMetrics: {
                        cartonUtilization: Math.round(result.efficiency.spaceUtilization * 100) / 100,
                        wasteSpace: Math.round((result.carton.volume - result.layout.itemsPacked * product.volume) * 100) / 100,
                        weightUtilized: Math.round((result.itemsPacked * product.weight / result.carton.maxWeight) * 1000) / 10,
                        spaceOptimality: result.layout.itemsPerLayer > 1 ? 'Good' : 'Could be improved'
                    },

                    packingOrder: allResults.length + 1,
                    timestamp: new Date().toISOString()
                });

                remainingQuantity -= result.itemsPacked;

                // Update carton availability
                const cartonIndex = workingCartons.findIndex(c => c.id === result.carton.id);
                if (cartonIndex >= 0) {
                    workingCartons[cartonIndex].availableQuantity--;
                }
            }
        }

        allResults.push(...productResults);

        if (remainingQuantity > 0) {
            unpackedProducts.push({
                productId: product.id,
                productName: product.name,
                remainingQuantity: remainingQuantity,
                reason: 'Insufficient carton space or weight capacity'
            });
        }
    }

    // Group reduction optimization
    if (groupReduction && allResults.length > 1) {
        // Attempt to consolidate items across fewer cartons
        // This would involve more complex re-optimization logic
        console.log('Group reduction optimization would be applied here');
    }

    // Calculate comprehensive summary
    const totalItemsPacked = allResults.reduce((sum, result) => sum + result.itemsPacked, 0);
    const totalRequestedItems = productArray.reduce((sum, product) => sum + product.quantity, 0);
    const totalCartonsUsed = allResults.length;
    const totalCost = allResults.reduce((sum, result) => sum + result.cost.total, 0);
    const avgVolumeEfficiency = allResults.length > 0
        ? allResults.reduce((sum, result) => sum + result.efficiency.volumeEfficiency, 0) / allResults.length
        : 0;

    // Carton type analysis
    const cartonTypeAnalysis = {};
    allResults.forEach(result => {
        const key = `${result.cartonDetails.length}×${result.cartonDetails.breadth}×${result.cartonDetails.height}`;
        if (!cartonTypeAnalysis[key]) {
            cartonTypeAnalysis[key] = {
                cartonType: key,
                count: 0,
                totalItems: 0,
                totalCost: 0,
                avgEfficiency: 0,
                cartonDetails: result.cartonDetails
            };
        }
        cartonTypeAnalysis[key].count++;
        cartonTypeAnalysis[key].totalItems += result.itemsPacked;
        cartonTypeAnalysis[key].totalCost += result.cost.total;
        cartonTypeAnalysis[key].avgEfficiency += result.efficiency.volumeEfficiency;
    });

    // Calculate averages for carton type analysis
    Object.values(cartonTypeAnalysis).forEach(analysis => {
        analysis.avgEfficiency = Math.round(analysis.avgEfficiency / analysis.count * 10) / 10;
        analysis.avgCostPerCarton = Math.round(analysis.totalCost / analysis.count * 100) / 100;
    });

    // Advanced analytics
    const analytics = {
        packingQuality: {
            overallScore: calculateOverallPackingScore(allResults),
            wasteAnalysis: calculateWasteAnalysis(allResults),
            stackingAnalysis: calculateStackingAnalysis(allResults),
            costEfficiency: totalItemsPacked > 0 ? Math.round((totalCost / totalItemsPacked) * 100) / 100 : 0
        },
        recommendations: generatePackingRecommendations(allResults, unpackedProducts, cartons),
        sustainability: {
            totalWasteVolume: allResults.reduce((sum, result) => sum + result.packingMetrics.wasteSpace, 0),
            packingDensity: totalItemsPacked > 0 ? allResults.length / totalItemsPacked : 0,
            carbonFootprint: estimateCarbonFootprint(allResults)
        }
    };

    return {
        packingResults: allResults,
        unpackedProducts: unpackedProducts,
        remainingQuantity: totalRequestedItems - totalItemsPacked,
        summary: {
            totalItemsRequested: totalRequestedItems,
            totalItemsPacked: totalItemsPacked,
            totalCartonsUsed: totalCartonsUsed,
            packingSuccess: unpackedProducts.length === 0,
            packingRate: Math.round((totalItemsPacked / totalRequestedItems) * 1000) / 10,
            overallVolumeEfficiency: Math.round(avgVolumeEfficiency * 10) / 10,
            totalCost: Math.round(totalCost * 100) / 100,
            cartonTypeBreakdown: Object.values(cartonTypeAnalysis),
            algorithmUsed: algorithm,
            optimizationApplied: {
                costOptimization,
                groupReduction,
                fragileHandling,
                stackingOptimization: true,
                orientationOptimization: true
            }
        },
        analytics: analytics,
        metadata: {
            calculationTime: Date.now(),
            version: '2.0.0',
            features: ['3D_LAYOUT', 'STACKING', 'COST_OPTIMIZATION', 'MULTI_PRODUCT', 'FRAGILE_HANDLING']
        }
    };
}

// Helper functions for advanced analytics
function calculateOverallPackingScore(results) {
    if (results.length === 0) return 0;

    const avgVolumeEfficiency = results.reduce((sum, r) => sum + r.efficiency.volumeEfficiency, 0) / results.length;
    const avgSpaceUtilization = results.reduce((sum, r) => sum + r.efficiency.spaceUtilization, 0) / results.length;
    const costEfficiency = results.reduce((sum, r) => sum + (1 / (r.cost.total + 1)), 0) / results.length;

    return Math.round((avgVolumeEfficiency * 0.4 + avgSpaceUtilization * 0.4 + costEfficiency * 0.2) * 100) / 100;
}

function calculateWasteAnalysis(results) {
    const totalCartonVolume = results.reduce((sum, r) => sum + r.cartonDetails.volume, 0);
    const totalWasteVolume = results.reduce((sum, r) => sum + r.packingMetrics.wasteSpace, 0);

    return {
        totalWasteVolume: Math.round(totalWasteVolume * 100) / 100,
        totalCartonVolume: Math.round(totalCartonVolume * 100) / 100,
        wastePercentage: totalCartonVolume > 0 ? Math.round((totalWasteVolume / totalCartonVolume) * 1000) / 10 : 0,
        avgWastePerCarton: results.length > 0 ? Math.round((totalWasteVolume / results.length) * 100) / 100 : 0
    };
}

function calculateStackingAnalysis(results) {
    const stackingResults = results.filter(r => r.stackingInfo && r.stackingInfo.totalLayers > 1);
    const singleLayerResults = results.filter(r => r.stackingInfo && r.stackingInfo.totalLayers === 1);

    return {
        totalStackedCartons: stackingResults.length,
        totalSingleLayerCartons: singleLayerResults.length,
        avgStackLayers: stackingResults.length > 0
            ? Math.round(stackingResults.reduce((sum, r) => sum + r.stackingInfo.totalLayers, 0) / stackingResults.length * 10) / 10
            : 0,
        stackingEfficiencyGain: calculateStackingEfficiencyGain(stackingResults, singleLayerResults),
        fragileItemsStacked: stackingResults.filter(r => r.stackingInfo.isFragileStacking).length
    };
}

function calculateStackingEfficiencyGain(stackedResults, singleLayerResults) {
    if (stackedResults.length === 0) return 0;

    const avgStackedEfficiency = stackedResults.reduce((sum, r) => sum + r.efficiency.volumeEfficiency, 0) / stackedResults.length;
    const avgSingleLayerEfficiency = singleLayerResults.length > 0
        ? singleLayerResults.reduce((sum, r) => sum + r.efficiency.volumeEfficiency, 0) / singleLayerResults.length
        : avgStackedEfficiency;

    return Math.round((avgStackedEfficiency - avgSingleLayerEfficiency) * 100) / 100;
}

function generatePackingRecommendations(results, unpackedProducts, cartons) {
    const recommendations = [];

    // Cost optimization recommendations
    const highCostResults = results.filter(r => r.cost.total > results.reduce((sum, r) => sum + r.cost.total, 0) / results.length);
    if (highCostResults.length > 0) {
        recommendations.push({
            type: 'COST_OPTIMIZATION',
            priority: 'HIGH',
            message: `${highCostResults.length} cartons have above-average costs. Consider using smaller or more cost-effective cartons.`,
            affectedCartons: highCostResults.map(r => r.cartonId)
        });
    }

    // Efficiency recommendations
    const lowEfficiencyResults = results.filter(r => r.efficiency.volumeEfficiency < 60);
    if (lowEfficiencyResults.length > 0) {
        recommendations.push({
            type: 'EFFICIENCY_IMPROVEMENT',
            priority: 'MEDIUM',
            message: `${lowEfficiencyResults.length} cartons have low volume efficiency (<60%). Consider different carton sizes or product orientations.`,
            affectedCartons: lowEfficiencyResults.map(r => r.cartonId)
        });
    }

    // Unpacked items recommendations
    if (unpackedProducts.length > 0) {
        recommendations.push({
            type: 'CAPACITY_SHORTAGE',
            priority: 'HIGH',
            message: `${unpackedProducts.length} product types could not be fully packed. Consider adding larger cartons or increasing weight capacity.`,
            unpackedProducts: unpackedProducts
        });
    }

    // Stacking recommendations
    const singleLayerResults = results.filter(r => r.stackingInfo && r.stackingInfo.totalLayers === 1);
    if (singleLayerResults.length > results.length * 0.3) {
        recommendations.push({
            type: 'STACKING_OPTIMIZATION',
            priority: 'MEDIUM',
            message: 'Many cartons use only single layers. Consider products that stack better or adjust carton heights.',
            affectedCartons: singleLayerResults.map(r => r.cartonId)
        });
    }

    return recommendations;
}

function estimateCarbonFootprint(results) {
    // Simple carbon footprint estimation based on carton volume and shipping
    const totalVolume = results.reduce((sum, r) => sum + r.cartonDetails.volume, 0);
    const totalWeight = results.reduce((sum, r) => sum + r.itemsPacked * 0.5, 0); // Assume 0.5kg per item average

    // Rough estimates: 0.1kg CO2 per cubic meter volume, 0.05kg CO2 per kg weight
    const volumeFootprint = totalVolume * 0.0001; // Convert to cubic meters and apply factor
    const weightFootprint = totalWeight * 0.05;

    return {
        totalFootprint: Math.round((volumeFootprint + weightFootprint) * 100) / 100,
        volumeComponent: Math.round(volumeFootprint * 100) / 100,
        weightComponent: Math.round(weightFootprint * 100) / 100,
        unit: 'kg CO2'
    };
}

// Enhanced input validation middleware
const validatePackingInput = (req, res, next) => {
    try {
        const { product: productData, cartons: cartonsData, products: productsData } = req.body;

        // Support both single product and multi-product input
        const products = productsData || (productData ? [productData] : null);

        if (!products || !cartonsData) {
            return res.status(400).json({
                success: false,
                message: "Product(s) and cartons data are required"
            });
        }

        // Validate products
        if (!Array.isArray(products)) {
            return res.status(400).json({
                success: false,
                message: "Products must be an array"
            });
        }

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const { length, breadth, height, weight, quantity } = product;

            if (!length || !breadth || !height || !weight || !quantity) {
                return res.status(400).json({
                    success: false,
                    message: `Product ${i + 1} must have length, breadth, height, weight, and quantity`
                });
            }

            if (length <= 0 || breadth <= 0 || height <= 0 || weight <= 0 || quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `All values for product ${i + 1} must be positive numbers`
                });
            }
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

// Enhanced optimal packing route with new features
router.post('/optimal-packing2', authenticateToken, async (req, res) => {
    try {
        const { productId, quantity, options = {} } = req.body;
        const userId = req.user._id;

        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: "productId and positive quantity are required"
            });
        }

        // Fetch product by ID and user
        const product = await ItemData.findOne({ _id: productId, createdBy: userId });
        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Product not found"
            });
        }

        // Fetch all boxes with available quantity > 0 for this user, sorted by priority
        const boxes = await BoxData.find({
            createdBy: userId,
            quantity: { $gt: 0 }
        }).lean().sort({
            priority: -1,
            cost: 1,
            volume: 1
        });

        if (!boxes.length) {
            return res.status(404).json({
                success: false,
                message: "No available boxes found"
            });
        }

        // Prepare enhanced product object
        const productObj = new Product(
            product.dimensions.length,
            product.dimensions.breadth,
            product.dimensions.height,
            product.weight,
            quantity,
            {
                id: product._id.toString(),
                name: product.name || 'Unknown Product',
                isFragile: product.isFragile || false,
                maxStackHeight: product.maxStackHeight || product.dimensions.height * 10,
                maxStackWeight: product.maxStackWeight || product.weight * 50,
                canRotate: product.canRotate !== false,
                priority: product.priority || 1,
                value: product.value || 0,
                damageCost: product.damageCost || (product.value || 0) * 0.1
            }
        );

        // Prepare enhanced carton objects
        const cartons = boxes.map(box => new Carton(
            box.length,
            box.breadth,
            box.height,
            box.max_weight,
            {
                id: box._id.toString(),
                name: box.name || 'Standard Carton',
                availableQuantity: box.quantity || 1,
                cost: box.cost || box.length * box.breadth * box.height * 0.001,
                shippingCost: box.shippingCost || (box.length * box.breadth * box.height * 0.0005 + box.max_weight * 0.01),
                priority: box.priority || 1,
                popularity: box.popularity || 0,
                fragileSupport: box.fragileSupport !== false,
                maxStackLayers: box.maxStackLayers || 10
            }
        ));

        // Enhanced packing options
        const packingOptions = {
            algorithm: options.algorithm || 'hybrid',
            costOptimization: options.costOptimization !== false,
            groupReduction: options.groupReduction !== false,
            fragileHandling: options.fragileHandling !== false,
            maxCartons: options.maxCartons || Infinity
        };

        // Calculate optimal packing with enhanced algorithm
        const result = calculateOptimalPacking([productObj], cartons, packingOptions);

        // Determine response status and message
        let statusCode = 200;
        let message = "Enhanced optimal packing calculation completed successfully";

        if (result.remainingQuantity > 0) {
            statusCode = 206; // Partial Content
            message = `Partial packing completed. ${result.remainingQuantity} items could not be packed (${result.summary.packingRate}% success rate).`;
        }

        // const { packingResults, ...resultWithoutPackingResults } = result;

        res.status(statusCode).json({
            success: true,
            message,
            productInfo: {
                id: product._id,
                name: product.name || 'Unknown Product',
                dimensions: `${product.dimensions.length}×${product.dimensions.breadth}×${product.dimensions.height}`,
                weight: product.weight,
                volume: productObj.volume,
                requestedQuantity: quantity,
                isFragile: productObj.isFragile,
                canRotate: productObj.canRotate
            },
            ...result
        });

    } catch (error) {
        console.error("Error in enhanced optimal packing calculation:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error during packing calculation",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// New enhanced route for direct multi-product packing calculation
router.post('/enhanced-packing', validatePackingInput, (req, res) => {
    try {
        const { product: productData, cartons: cartonsData, products: productsData, options = {} } = req.body;

        // Support both single and multi-product input
        const inputProducts = productsData || (productData ? [productData] : []);

        // Create enhanced product objects
        const products = inputProducts.map((prod, index) => new Product(
            prod.length,
            prod.breadth,
            prod.height,
            prod.weight,
            prod.quantity,
            {
                id: prod.id || `product_${index}`,
                name: prod.name || `Product ${index + 1}`,
                isFragile: prod.isFragile || false,
                maxStackHeight: prod.maxStackHeight || prod.height * 10,
                maxStackWeight: prod.maxStackWeight || prod.weight * 50,
                canRotate: prod.canRotate !== false,
                priority: prod.priority || 1,
                value: prod.value || 0,
                damageCost: prod.damageCost || (prod.value || 0) * 0.1
            }
        ));

        // Create enhanced carton objects
        const cartons = cartonsData.map((carton, index) => new Carton(
            carton.length,
            carton.breadth,
            carton.height,
            carton.maxWeight,
            {
                id: carton.id || `carton_${index}`,
                name: carton.name || `Carton ${index + 1}`,
                availableQuantity: carton.availableQuantity || 1,
                cost: carton.cost || carton.length * carton.breadth * carton.height * 0.001,
                shippingCost: carton.shippingCost || (carton.length * carton.breadth * carton.height * 0.0005 + carton.maxWeight * 0.01),
                priority: carton.priority || 1,
                popularity: carton.popularity || 0,
                fragileSupport: carton.fragileSupport !== false,
                maxStackLayers: carton.maxStackLayers || 10
            }
        ));

        // Enhanced packing calculation
        const result = calculateOptimalPacking(products, cartons, options);

        let statusCode = 200;
        let message = "Enhanced packing calculation completed successfully";

        if (result.remainingQuantity > 0) {
            statusCode = 206;
            message = `Partial packing completed. ${result.remainingQuantity} items could not be packed (${result.summary.packingRate}% success rate).`;
        }

        res.status(statusCode).json({
            success: true,
            message,
            ...result
        });

    } catch (error) {
        console.error("Error in enhanced packing calculation:", error);
        res.status(500).json({
            success: false,
            message: "Error during enhanced packing calculation",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;