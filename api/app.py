from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Product and Carton classes
class Product:
    def __init__(self, length, breadth, height, weight, quantity):
        self.length = length
        self.breadth = breadth
        self.height = height
        self.weight = weight
        self.quantity = quantity

class Carton:
    def __init__(self, length, breadth, height, max_weight, quantity):
        # Deduct 2 inches from dimensions for buffer
        self.length = length - 2
        self.breadth = breadth - 2
        self.height = height - 2
        self.max_weight = max_weight
        self.quantity = quantity

# Function to calculate optimal packing
def calculate_optimal_packing(product, cartons):
    remaining_quantity = product.quantity  # Total products to pack
    packing_results = {}  # Dictionary to store packing results by carton index

    while remaining_quantity > 0:
        best_fit = None
        best_carton_index = None

        for i, carton in enumerate(cartons):
            if carton.quantity <= 0:  # Skip cartons that are exhausted
                continue

            # Check all 3 orientations
            orientations = [
                (carton.length // product.length, carton.breadth // product.breadth, carton.height // product.height),
                (carton.length // product.breadth, carton.breadth // product.height, carton.height // product.length),
                (carton.length // product.height, carton.breadth // product.length, carton.height // product.breadth),
            ]

            for orientation, (fit_l, fit_b, fit_h) in enumerate(orientations):
                items_fit = fit_l * fit_b * fit_h
                max_weight_items = carton.max_weight // product.weight  # Max items by weight
                items_fit = min(items_fit, max_weight_items)  # Restrict by weight

                if items_fit > 0:
                    total_items_fit = min(items_fit, remaining_quantity)  # Limit by remaining quantity
                    if best_fit is None or total_items_fit > best_fit["total_items"]:
                        best_fit = {
                            "carton_index": i,
                            "orientation": orientation,
                            "fit_lengthwise": fit_l,
                            "fit_breadthwise": fit_b,
                            "fit_heightwise": fit_h,
                            "total_items": total_items_fit,
                        }
                        best_carton_index = i

        if best_fit is None:
            print("No suitable carton found for the remaining items.")
            break

        # Update carton quantity and reduce remaining items
        carton = cartons[best_carton_index]
        carton.quantity -= 1
        remaining_quantity -= best_fit["total_items"]

        # Merge results for the same carton index
        if best_fit["carton_index"] in packing_results:
            packing_results[best_fit["carton_index"]]["cartons_used"] += 1
            packing_results[best_fit["carton_index"]]["total_items"] += best_fit["total_items"]
        else:
            packing_results[best_fit["carton_index"]] = {
                "carton_index": best_fit["carton_index"],
                "orientation": best_fit["orientation"],
                "fit_lengthwise": best_fit["fit_lengthwise"],
                "fit_breadthwise": best_fit["fit_breadthwise"],
                "fit_heightwise": best_fit["fit_heightwise"],
                "total_items": best_fit["total_items"],
                "cartons_used": 1
            }

    return list(packing_results.values()), remaining_quantity

# API endpoint for optimal packing
@app.route('/api/optimal-packing', methods=['POST'])
def optimal_packing():
    try:
        # Parse input JSON data
        data = request.get_json()
        if not data:
            raise ValueError("No JSON payload received")

        # Extract product and cartons data
        product_data = data.get("product")
        cartons_data = data.get("cartons")

        if not product_data or not cartons_data:
            raise ValueError("Product or cartons data is missing")

        # Initialize Product and Cartons
        product = Product(**product_data)
        cartons = [Carton(**carton) for carton in cartons_data]

        # Calculate optimal packing
        packing_results, remaining_quantity = calculate_optimal_packing(product, cartons)

        # Return response
        response = {
            "success": True,
            "packing_results": packing_results,
            "remaining_quantity": remaining_quantity,
        }
        return jsonify(response), 200

    except Exception as e:
        print(f"Error: {e}")  # Log the error for debugging
        return jsonify({"success": False, "msg": str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True, port=5500)