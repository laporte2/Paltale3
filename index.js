var loaderUrl = "https://hvilla.ams3.cdn.digitaloceanspaces.com/nutaku_live/Build/Alpha_0.15.8_nutaku.json";
var gameInstance;

const fileVersionn = "11.08.2023";
AvailableStorage.setItem("fileVersion", fileVersionn);


/**
 * Authenticate a nutaku player.
 * @function @async
 * @param {!object} userData - user infos object 
*/
async function authNutakuPlayer (userData) {
    const params = {};
    params[gadgets.io.RequestParameters.METHOD] = gadgets.io.MethodType.GET;
    params[gadgets.io.RequestParameters.AUTHORIZATION] = gadgets.io.AuthorizationType.SIGNED;
    try {
        let res = await new Promise((resolve, reject) => {
            gadgets.io.makeRequest("https://hornyvilla.com/api/auth/nutaku?nutaku_id=" + userData.id + "&user_name=" + userData.nickname + "&grade=" + userData.grade, (obj) => {
                try {
                    response = JSON.parse(obj.data)
                    AvailableStorage.setItem("player_id", response.data.player_id)
                    resolve(response.data)
                } catch (error) {
                    console.error("error CB authNutakuPlayer : ", error)
                    reject(error)
                }
            }, params)
        })
        return res
        console.log("res authNutakuPlayer : ", res)
    } catch (error) {
        console.error("error authNutakuPlayer : ", error)
    }
}

async function fetchUserData (callback) {

    var params = {};
    params[opensocial.DataRequest.PeopleRequestFields.PROFILE_DETAILS] = [
        opensocial.Person.Field.NICKNAME,
        nutaku.Person.Field.GRADE
    ];

    var req = opensocial.newDataRequest();
    req.add(
        req.newFetchPersonRequest(opensocial.IdSpec.PersonId.VIEWER, params),
        "viewer"
    );
    let res = await new Promise((resolve, reject) => {
        req.send(async function (response) {
            if (response.hadError()) {
                console.error("response error", response);
                reject(response)
            } else {
                var item = response.get("viewer");
                if (item.hadError()) {
                    console.error("item error", item);
                } else {
                    var result = item.getData();
                    var id = result.getField(opensocial.Person.Field.ID);
                    var grade = result.getField(nutaku.Person.Field.GRADE);
                    var nickname = result.getField(opensocial.Person.Field.NICKNAME);

                    AvailableStorage.setItem("nutaku_id", id)
                    AvailableStorage.setItem("grade", grade)
                    AvailableStorage.setItem("nickname", nickname)

                    cachedUser = { id, grade, nickname };
                    resolve(cachedUser)
                }
            }
        })

    });
    return res

}

async function init () {
    gadgets.window.adjustHeight(900);
    console.log("START LOADING")
    let userData = await fetchUserData()

    let playerAuthInfos = await authNutakuPlayer(userData)

    gameInstance = UnityLoader.instantiate("unityContainer", loaderUrl, { onProgress: UnityProgress });
}
gadgets.util.registerOnLoadHandler(init);


/**
 * Update Payment status in our server 
 * @function @async
 * @param {!string} status  
 * @param {!number | !string} paymentID  
*/
async function changePaymentStatus (status, paymentID) {
    const params = {};
    params[gadgets.io.RequestParameters.METHOD] = gadgets.io.MethodType.GET;
    params[gadgets.io.RequestParameters.AUTHORIZATION] = gadgets.io.AuthorizationType.SIGNED;
    const URL = `https://hornyvilla.com/api/nutaku/payment/${paymentID}/${status}`
    await new Promise(resolve => {
        gadgets.io.makeRequest(URL, (obj) => {
            try {
                let response = JSON.parse(obj.data)
                AvailableStorage.setItem('lastInvoiceID', response.data.ID)
            } catch (error) {
                console.error("changePaymentStatus makeRequest ERROR : ", error)
            } finally {
                resolve()
            }
        }, params)
    })
}

/**
 * Initiate and complete a transaction.
 * @function @async
 * @param {!object} payment - user infos object 
*/
async function requestPayment (payment) {
    return await new Promise((resolve, reject) => {
        opensocial.requestPayment(payment, function (response) {
            if (response.hadError()) {
                // when request fails here (after sending create new invoice to BE server from nutaku) the response doesn't include the payment_id, to send it back to server and fail it
                console.error("ERROR requestPayment: ", response, payment)
                return resolve({
                    statusPaymentForServer: "failed",
                    statusPaymentForUnity: "OnPurchaseFailed",
                    paymentID: null
                })

            } else {
                let payment = response.getData();
                let paymentID = payment.getField(nutaku.Payment.Field.PAYMENT_ID)
                return resolve({
                    statusPaymentForServer: "succeeded",
                    statusPaymentForUnity: "OnPurchaseComplete",
                    paymentID
                })
            }
        });
    })
}
async function purchaseItem (monetizationId, item_name, itemId, price, item_description, item_image_url) {

    const itemParams = {};
    itemParams[opensocial.BillingItem.Field.SKU_ID] = itemId; //TODO: get from params id
    itemParams[opensocial.BillingItem.Field.PRICE] = Number(price); //TODO: get from params prices
    itemParams[opensocial.BillingItem.Field.COUNT] = 1; // the currentsystem supports selling multiple amounts of an item, this aspect isplanned for deprecation.Please only use 1.
    itemParams[opensocial.BillingItem.Field.DESCRIPTION] = item_description;
    itemParams[nutaku.BillingItem.Field.NAME] = item_name;
    itemParams[nutaku.BillingItem.Field.IMAGE_URL] = item_image_url;    //jpg or gif. There are no specific size requirements for the image as long as the image looks good and it is not so big that it makes the containing pop - up be bigger than your game area.

    const item = opensocial.newBillingItem(itemParams);

    const params = {};
    params[opensocial.Payment.Field.ITEMS] = [item]; // the current system supports multiple item types in the same payment, but this will be deprecated.Please only use 1 item object per payment.
    params[opensocial.Payment.Field.MESSAGE] = "Optional message to show alongside the item"; // we recommend leaving this blank and using the Name and Description fields.
    params[opensocial.Payment.Field.PAYMENT_TYPE] = opensocial.Payment.PaymentType.PAYMENT;

    let payment = opensocial.newPayment(params);
    const { statusPaymentForServer, statusPaymentForUnity, paymentID } = await requestPayment(payment)

    //if get a non null payment id we update our DB
    if (paymentID) {
        await changePaymentStatus(statusPaymentForServer, paymentID) // send final payment status to BE server
    }

    gameInstance.SendMessage('NutakuTestController', statusPaymentForUnity, monetizationId)
    this.focus()
}
