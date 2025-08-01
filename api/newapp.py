from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:3000",
    "http://127.0.0.1:3000"
])

# Product and Carton classes
class Product:
    def __init__(self, length, breadth, height, weight, quantity):
        if length <= 0 or breadth <= 0 or height <= 0 or weight <= 0 or quantity <= 0:
            raise ValueError("Invalid product dimensions or quantity.")
        self.length = length
        self.breadth = breadth
        self.height = height
        self.weight = weight
        self.quantity = quantity

class Carton:
    def __init__(self, length, breadth, height, max_weight, quantity, buffer=1):
        if length <= 0 or breadth <= 0 or height <= 0 or max_weight <= 0 or quantity <= 0:
            raise ValueError("Invalid carton dimensions or quantity.")
        self.length = length - buffer
        self.breadth = breadth - buffer
        self.height = height - buffer
        self.max_weight = max_weight
        self.quantity = quantity

# Function to calculate optimal packing
def calculate_optimal_packing(product, cartons):
    remaining_quantity = product.quantity
    packing_results = {}

    while remaining_quantity > 0:
        best_fit = None
        best_carton_index = None

        for i, carton in enumerate(cartons):
            if carton.quantity <= 0:
                continue

            orientations = [
                (carton.length // product.length, carton.breadth // product.breadth, carton.height // product.height),
                (carton.length // product.breadth, carton.breadth // product.height, carton.height // product.length),
                (carton.length // product.height, carton.breadth // product.length, carton.height // product.breadth),
                (carton.length // product.length, carton.breadth // product.height, carton.height // product.breadth),
                (carton.length // product.height, carton.breadth // product.breadth, carton.height // product.length),
                (carton.length // product.breadth, carton.breadth // product.length, carton.height // product.height)
            ]

            for orientation, (fit_l, fit_b, fit_h) in enumerate(orientations):
                items_fit = fit_l * fit_b * fit_h
                max_weight_items = carton.max_weight // product.weight
                items_fit = min(items_fit, max_weight_items)

                if items_fit > 0:
                    total_items_fit = min(items_fit, remaining_quantity)
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
            return [], remaining_quantity

        carton = cartons[best_carton_index]
        carton.quantity -= 1
        remaining_quantity -= best_fit["total_items"]

        if best_fit["carton_index"] in packing_results:
            packing_results[best_fit["carton_index"]]["cartons_used"] += 1
            packing_results[best_fit["carton_index"]]["total_items"] += best_fit["total_items"]
        else:
            packing_results[best_fit["carton_index"]] = {
                **best_fit,
                "cartons_used": 1
            }

    return list(packing_results.values()), remaining_quantity

@app.route('/api/optimal-packing', methods=['POST'])
def optimal_packing():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"success": False, "msg": "No JSON payload received."}), 400

        product_data = data.get("product")
        cartons_data = data.get("cartons")

        if not product_data or not cartons_data:
            return jsonify({"success": False, "msg": "Missing product or cartons data."}), 400

        product = Product(**product_data)
        cartons = [Carton(**carton) for carton in cartons_data]

        packing_results, remaining_quantity = calculate_optimal_packing(product, cartons)

        return jsonify({
            "success": True,
            "packing_results": packing_results,
            "remaining_quantity": remaining_quantity
        }), 200
    
    except ValueError as e:
        return jsonify({"success": False, "msg": str(e)}), 400
    except Exception as e:
        return jsonify({"success": False, "msg": "Server error: " + str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5500)
