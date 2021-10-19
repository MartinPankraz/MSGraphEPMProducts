sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
    "sap/ui/core/routing/History",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
	"../model/formatter"
], function (BaseController, JSONModel, History, Fragment, MessageToast, formatter) {
	"use strict";

	return BaseController.extend("msgraphepmproducts.msgraphepmproducts.controller.Object", {

        formatter: formatter,
        
        config: {
            graphBaseEndpoint: "https://graph.microsoft.com/v1.0/",
            queryMessagesSuffix: "me/messages?$search=\"$1\"&$top=15"
        },

		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */

		/**
		 * Called when the worklist controller is instantiated.
		 * @public
		 */
		onInit : function () {
            var that = this;
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var iOriginalBusyDelay,
				oViewModel = new JSONModel({
					busy : true,
					delay : 0
				});

			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);

			// Store original busy indicator delay, so it can be restored later on
			iOriginalBusyDelay = this.getView().getBusyIndicatorDelay();
			this.setModel(oViewModel, "objectView");
			this.getOwnerComponent().getModel().metadataLoaded().then(function () {
					// Restore original busy indicator delay for the object view
					oViewModel.setProperty("/delay", iOriginalBusyDelay);
				}
            );
            
            this.getView().addEventDelegate({
                onBeforeShow: function(event) {
                    that.myMSALAccessToken = this.getView().data("data");
                }
            }, this);
		},

		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */


		/**
		 * Event handler  for navigating back.
		 * It there is a history entry we go one step back in the browser history
		 * If not, it will replace the current entry of the browser history with the worklist route.
		 * @public
		 */
		onNavBack : function() {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("worklist", {}, true);
			}
        },

        onOpenEmail: function (oEvent) {
            var sEmail = oEvent.getSource().getBindingContext("msData").getProperty("webLink");
            window.open(sEmail, "_blank");
        },

		/* =========================================================== */
		/* internal methods                                            */
		/* =========================================================== */

		/**
		 * Binds the view to the object path.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched : function (oEvent) {
			var sObjectId =  oEvent.getParameter("arguments").objectId;
			this.getModel().metadataLoaded().then( function() {
				var sObjectPath = this.getModel().createKey("ProductSet", {
					ProductID :  sObjectId
				});
				this._bindView("/" + sObjectPath);
			}.bind(this));
		},

		/**
		 * Binds the view to the object path.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound
		 * @private
		 */
		_bindView : function (sObjectPath) {
			var oViewModel = this.getModel("objectView"),
				oDataModel = this.getModel();

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oDataModel.metadataLoaded().then(function () {
							// Busy indicator on view should only be set if metadata is loaded,
							// otherwise there may be two busy indications next to each other on the
							// screen. This happens because route matched handler already calls '_bindView'
							// while metadata is loaded.
							oViewModel.setProperty("/busy", true);
						});
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		_onBindingChange : function () {
			var oView = this.getView(),
				oViewModel = this.getModel("objectView"),
				oElementBinding = oView.getElementBinding();

			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("objectNotFound");
				return;
			}

			var oResourceBundle = this.getResourceBundle(),
				oObject = oView.getBindingContext().getObject(),
				sObjectId = oObject.ProductID,
				sObjectName = oObject.ProductID;

			oViewModel.setProperty("/busy", false);

			oViewModel.setProperty("/shareSendEmailSubject",
			oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage",
			oResourceBundle.getText("shareSendEmailObjectMessage", [sObjectName, sObjectId, location.href]));
        },

        _openQuickView: function (oEvent) {
            var sLinkText = oEvent.getSource().getText(),
                oClickSource = oEvent.getSource(),
                oView = this.getView(),
                oModel = new JSONModel(),
                that = this;

            oView.setModel(oModel, "msData"),
            
            $.ajax({
                url: this.config.graphBaseEndpoint + this.config.queryMessagesSuffix.replace("$1", sLinkText),
                type: "GET",
                beforeSend: function (xhr) {
                    xhr.setRequestHeader("Authorization", "Bearer " + that.myMSALAccessToken);
                }
            })
            .then(function (results) {
                /*results.value = results.value.map(function (o) {
                    o.bodyPreview = o.bodyPreview.replace(sLinkText, "<strong>" + sLinkText + "</strong>");
                    return o;
                });*/
                results.count = results.value.length;
                oModel.setData(results);
                if (!that._pDialog) {
                    that._pDialog = Fragment.load({
                        id: oView.getId(),
                        name: "msgraphepmproducts.msgraphepmproducts.view.SelectDialog",
                        controller: that
                    }).then(function (oDialog) {
                        //oDialog.setModel(oView.getModel("msData"));
                        that._pDialog = oDialog;
                        oView.addDependent(that._pDialog);
                        that._pDialog.openBy(oClickSource);
                    });
                }else{
                    that._pDialog.openBy(oClickSource);
                }
            })
            .fail(function (error) {
                MessageToast.show("Timeout, please go back to overview and refresh.");
                $.sap.log.error(JSON.stringify(error.responseJSON.error));
            });
        },

		handleCloseButton: function (oEvent) {
			// note: We don't need to chain to the _pPopover promise, since this event-handler
			// is only called from within the loaded dialog itself.
			this.byId("mySelectDialog").close();
		}

	});

});