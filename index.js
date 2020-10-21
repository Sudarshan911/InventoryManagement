const Express = require("express");
const BodyParser = require("body-parser");
const { response, request } = require("express");
const MongoClient = require("mongodb").MongoClient;
const CONNECTION_URL = "mongodb://localhost:27017/";
const DATABASE_NAME = "accounting_department";


var app = Express();
app.use(BodyParser.json());
app.use(BodyParser.urlencoded({ extended: true }));
var database;

app.listen(5000, () => {
    MongoClient.connect(CONNECTION_URL, { useNewUrlParser: true }, (error, client) => {
        if (error) {
            throw error;
        }
        database = client.db(DATABASE_NAME);

        console.log("Connected to `" + DATABASE_NAME + "`!");
    });
});


/* Inserts the product into the Inventory. */
app.post("/Inventory", (request, response) => {

    //Giving error response when body is empty
    if (Object.keys(request.body).length == 0) {
        return response.status(400).send({ message: "Data can't be empty" })
    }

    database.collection("Inventory").insert(request.body, (error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        response.send("Product added to the Inventory");
    });
});


/* Retreives the products and their information from Inventory*/
app.get("/Inventory", (request, response) => {
    database.collection("Inventory").find({}).toArray((error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        if (result.length == 0) {
            return response.status(200).send({ message: "There are no items in Inventory" });
        }
        return response.status(200).send(result);
    });
});


/* Changing the status of order to "cancelled". Increases the quantity of the product availaible after cancellation */
app.put("/cancelorder", (request, response) => {
    //Giving error response when body is empty
    if (Object.keys(request.body).length == 0) {
        return response.status(400).send({ message: "Data can't be empty" })
    }


    database.collection("PlacedOrders").find({ "customer_name": request.body[0].customer_name, "product": request.body[0].product }).toArray((err, res) => {
        if (err) throw err;
        // Checking if the status of the order is "confirmed" 
        if (res[0].status == "confirmed") {
            // update order status to "cancelled"
            database.collection("PlacedOrders").update({ "customer_name": request.body[0].customer_name, "product": request.body[0].product }, { $set: { "status": "cancelled" } }, (err, res) => {
                if (err) throw err;

                // Using the "Placedordered collection to identify the respective Inventory document to be updated"
                database.collection("Placedorderwarehouse").find({ "name": request.body[0].customer_name }).toArray((err, res) => {
                    if (err) throw err;
                    database.collection("Inventory").update({ "product": request.body[0].product, "Warehouse": res[0].warehouse }, {
                        //updating the quantity in Inventory
                        $inc: { "InStock": request.body[0].quantity_requested }

                    })
                })
                response.send("order cancelled");
            })
        }
        //if the order status is already "cancelled",give error response
        else {
            response.status(400).send({ message: "Order already cancelled" });
        }
    })

})

/* Retrieves the placed orders from "PlacedOrders" collection */
app.get("/placeorder", (request, response) => {
    database.collection("PlacedOrders").find().toArray((error, result) => {
        if (error) {
            return response.status(500).send(error);
        }
        if (result.length == 0) {
            return response.status(200).send({ message: "There are no placed orders" });
        }
        response.status(200).send(result);
    });
});


/* Places the order if the required quantity is less than or equal to the quantity availaible. 
Deducts the respective quantity from the Inventory after order gets placed  */
app.post("/placeorder", (request, response) => {
    //Giving error response when body is empty
    if (Object.keys(request.body).length == 0) {
        return response.status(400).send({ message: "Data cant be empty" })
    }

    //retrieving the warehouse which has maximum quantity of particular product
    database.collection("Inventory").find({ "product": request.body[0].product }).sort({ "InStock": -1 }).limit(1) // for MAX

    .toArray((error, result) => {

        if (result[0].InStock >= request.body[0].quantity_requested) {

            //placing the order
            database.collection("PlacedOrders").insert(request.body, (error, result1) => {
                if (error) {
                    return response.status(500).send(error);
                }
                //Inserting data in Placedorderwarehouse
                database.collection("Placedorderwarehouse").insert({ "name": request.body[0].customer_name, "warehouse": result[0].Warehouse })

                //deducting the order equivalent quantity of product from inventory
                database.collection("Inventory").update({ "_id": result[0]._id }, { $inc: { "InStock": -request.body[0].quantity_requested } })

                response.send("order successful");
            });
        } else {
            //send response message  if availaible quantity is less than required quantity
            response.send("Availaible quantity is less than requested quantity. " + "availaible quantity is: " + result[0].InStock)
        }
    })



});