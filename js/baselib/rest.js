(function()
{
  // Make 'qx' available within this closure
  var qx = window.qxWeb.$$qx;

  // Make sure the namespaces are created with the correct root. In order to
  // isolate the qx within the closure we have to make sure that every new class
  // is created under the correct root (window.qxWeb.$$qx in this case)
  qx.Bootstrap.setRoot({ qx: window.qxWeb.$$qx,
                         baselib: window.baselib,
                         qui: window.qui });
  
  qx.$$packageData['0']={"locales":{},"resources":{},"translations":{"C":{}}};
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2013 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Richard Sternagel (rsternagel)

************************************************************************ */

/**
 * Client-side wrapper of a REST resource.
 *
 * Each instance represents a resource in terms of REST. A number of actions
 * (usually HTTP methods) unique to the resource can be defined and invoked.
 * A resource with its actions is configured declaratively by passing a resource
 * description to the constructor, or programatically using {@link #map}.
 *
 * Each action is associated to a route. A route is a combination of method,
 * URL pattern and optional parameter constraints.
 *
 * An action is invoked by calling a method with the same name. When a URL
 * pattern of a route contains positional parameters, those parameters must be
 * passed when invoking the associated action. Also, constraints defined in the
 * route must be satisfied.
 *
 * When an action is invoked, a request is configured according to the associated
 * route, is passed the URL parameters, request body data, and finally send.
 * What kind of request is send can be configured by overwriting {@link #_getRequest}.
 *
 * No contraints on the action's name or the scope of the URLs are imposed. However,
 * if you want to follow RESTful design patterns it is recommended to name actions
 * the same as the HTTP action.
 *
 * <pre class="javascript">
 * var description = {
 *  "get": { method: "GET", url: "/photo/{id}" },
 *  "put": { method: "PUT", url: "/photo/{id}"},
 *  "post": { method: "POST", url: "/photos/"}
 * };
 * var photo = new qx.bom.rest.Resource(description);
 * // Can also be written: photo.invoke("get", {id: 1});
 * photo.get({id: 1});
 *
 * // Additionally sets request data (provide it as string or set the content type)
 * // In a RESTful environment this creates a new resource with the given 'id'
 * photo.configureRequest(function(req) {
 *  req.setRequestHeader("Content-Type", "application/json");
 * });
 * photo.put({id: 1}, {title: "Monkey"});
 *
 * // Additionally sets request data (provide it as string or set the content type)
 * // In a RESTful environment this adds a new resource to the resource collection 'photos'
 * photo.configureRequest(function(req) {
 *  req.setRequestHeader("Content-Type", "application/json");
 * });
 * photo.post(null, {title: "Monkey"});
 * </pre>
 *
 * To check for existence of URL parameters or constrain them to a certain format, you
 * can add a <code>check</code> property to the description. See {@link #map} for details.
 *
 * <pre class="javascript">
 * var description = {
 *  "get": { method: "GET", url: "/photo/{id}", check: { id: /\d+/ } }
 * };
 * var photo = new qx.bom.rest.Resource(description);
 * // photo.get({id: "FAIL"});
 * // -- Error: "Parameter 'id' is invalid"
 * </pre>
 *
 * If your description happens to use the same action more than once, consider
 * defining another resource.
 *
 * <pre class="javascript">
 * var description = {
 *  "get": { method: "GET", url: "/photos"},
 * };
 * // Distinguish "photo" (singular) and "photos" (plural) resource
 * var photos = new qx.bom.rest.Resource(description);
 * photos.get();
 * </pre>
 *
 * Basically, all routes of a resource should point to the same URL (resource in
 * terms of HTTP). One acceptable exception of this constraint are resources where
 * required parameters are part of the URL (<code>/photos/1/</code>) or filter
 * resources. For instance:
 *
 * <pre class="javascript">
 * var description = {
 *  "get": { method: "GET", url: "/photos/{tag}" }
 * };
 * var photos = new qx.bom.rest.Resource(description);
 * photos.get();
 * photos.get({tag: "wildlife"})
 * </pre>
 *
 * Strictly speaking, the <code>photos</code> instance represents two distinct resources
 * and could therefore just as well mapped to two distinct resources (for instance,
 * named photos and photosTagged). What style to choose depends on the kind of data
 * returned. For instance, it seems sensible to stick with one resource if the filter
 * only limits the result set (i.e. the invidual results have the same properties).
 *
 * In order to respond to successful (or erroneous) invocations of actions,
 * either listen to the generic "success" or "error" event and get the action
 * from the event data, or listen to action specific events defined at runtime.
 * Action specific events follow the pattern "&lt;action&gt;Success" and
 * "&lt;action&gt;Error", e.g. "indexSuccess".
 *
 * @group (IO)
 */
qx.Bootstrap.define("qx.bom.rest.Resource",
{
  extend: qx.event.Emitter,

  /**
   * @param description {Map?} Each key of the map is interpreted as
   *  <code>action</code> name. The value associated to the key must be a map
   *  with the properties <code>method</code> and <code>url</code>.
   *  <code>check</code> is optional. Also see {@link #map}.
   *
   * For example:
   *
   * <pre class="javascript">
   * { get: {method: "GET", url: "/photos/{id}", check: { id: /\d+/ }} }
   * </pre>
   *
   * @see qx.bom.rest
   * @see qx.io.rest
   */
  construct: function(description)
  {
    this.__requests = {};
    this.__routes = {};
    this.__pollTimers = {};
    this.__longPollHandlers = {};

    try {
      if (typeof description !== "undefined") {
        if (qx.core.Environment.get("qx.debug")) {
          qx.core.Assert.assertMap(description);
        }
        this.__mapFromDescription(description);
      }
    } catch(e) {
      this.dispose();
      throw e;
    }
  },

  events:
  {
    /**
     * Fired when any request was successful.
     *
     * The action the successful request is associated to, as well as the
     * request itself, can be retrieved from the event’s properties.
     * Additionally, an action specific event is fired that follows the pattern
     * "<action>Success", e.g. "indexSuccess".
     */
    "success": "qx.bom.rest.Resource",

    /**
     * Fired when request associated to action given in prefix was successful.
     *
     * For example, "indexSuccess" is fired when <code>index()</code> was
     * successful.
     */
     "actionSuccess": "qx.bom.rest.Resource",

    /**
     * Fired when any request fails.
     *
     * The action the failed request is associated to, as well as the
     * request itself, can be retrieved from the event’s properties.
     * Additionally, an action specific event is fired that follows the pattern
     * "<action>Error", e.g. "indexError".
     */
    "error": "qx.bom.rest.Resource",

    /**
     * Fired when any request associated to action given in prefix fails.
     *
     * For example, "indexError" is fired when <code>index()</code> failed.
     */
     "actionError": "qx.bom.rest.Resource"
  },

  statics:
  {
    /**
     * Number of milliseconds below a long-poll request is considered immediate and
     * subject to throttling checks.
     */
    POLL_THROTTLE_LIMIT: 100,

    /**
     * Number of immediate long-poll responses accepted before throttling takes place.
     */
    POLL_THROTTLE_COUNT: 30,

    /**
     * A symbol used in checks to declare required parameter.
     */
    REQUIRED: true,

    /**
     * Get placeholders from URL.
     *
     * @param url {String} The URL to parse for placeholders.
     * @return {Array} Array of placeholders without the placeholder prefix.
     */
    placeholdersFromUrl: function(url) {
      var placeholderRe = /\{(\w+)(=\w+)?\}/g,
          match,
          placeholders = [];

      // With g flag set, searching begins at the regex object's
      // lastIndex, which is zero initially and increments with each match.
      while ((match = placeholderRe.exec(url))) {
        placeholders.push(match[1]);
      }

      return placeholders;
    }
  },

  members:
  {
    __requests: null,
    __routes: null,
    __baseUrl: null,
    __pollTimers: null,
    __longPollHandlers: null,
    __configureRequestCallback: null,

    /**
     * @type {Map} Request callbacks for 'onsuccess', 'onfail' and 'onloadend' - see {@link #setRequestHandler}.
     */
    __requestHandler: null,

    /**
     * @type {Function} Function which returns instances from {@link qx.io.request.AbstractRequest}.
     */
    __begetRequest: null,

    //
    // Request
    //

    /**
     * Set a request factory function to switch the request implementation.
     * The created requests have to implement {@link qx.io.request.AbstractRequest}.
     *
     * @param fn {Function} Function which returns request instances.
     *
     * @internal
     */
    setRequestFactory: function(fn) {
      this.__begetRequest = fn;
    },

    /**
     * Sets request callbacks for 'onsuccess', 'onfail' and 'onloadend'.
     *
     * @param handler {Map} Map defining callbacks and their context.
     *
     * For example:
     *
     * <pre class="javascript">
     * {
     *   onsuccess: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     *   onfail: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     *   onloadend: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     * }
     * </pre>
     *
     * @internal
     */
    setRequestHandler: function(handler) {
      this.__requestHandler = handler;
    },

    /**
     * Provides the request callbacks for 'onsuccess', 'onfail' and 'onloadend'.
     *
     * @return {Map} Map defining callbacks and their context.
     *
     * For example:
     *
     * <pre class="javascript">
     * {
     *   onsuccess: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     *   onfail: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     *   onloadend: {
     *    callback: function(req, action) { ... },
     *    context: obj
     *   }
     * }
     * </pre>
     */
    _getRequestHandler: function() {
      return (this.__requestHandler === null) ? {
        onsuccess: {
          callback: function(req, action) {
            return function() {
              var response = {
                  "id": parseInt(req.toHashCode(), 10),
                  "response": req.getResponse(),
                  "request": req,
                  "action": action
              };
              this.emit(action + "Success", response);
              this.emit("success", response);
            };
          },
          context: this
        },
        onfail: {
          callback: function(req, action) {
            return function() {
              var response = {
                  "id": parseInt(req.toHashCode(), 10),
                  "response": req.getResponse(),
                  "request": req,
                  "action": action
              };
              this.emit(action + "Error", response);
              this.emit("error", response);
            };
          },
          context: this
        },
        onloadend: {
          callback: function(req, action) {
            return function() {
              req.dispose();
            };
          },
          context: this
        }
      } : this.__requestHandler;
    },

    /**
     * Retrieve the currently stored request objects for an action.
     *
     * @param action {String} The action (e.g. "get", "post" ...).
     * @return {Array|null} Request objects.
     *
     * @internal
     */
    getRequestsByAction: function (action) {
      var hasRequests = (this.__requests !== null && action in this.__requests);
      return hasRequests ? this.__requests[action] : null;
    },

    /**
     * Configure request.
     *
     * @param callback {Function} Function called before request is send.
     *   Receives request, action, params and data.
     *
     * <pre class="javascript">
     * res.configureRequest(function(req, action, params, data) {
     *   if (action === "index") {
     *     req.setRequestHeader("Accept", "application/json");
     *   }
     * });
     * </pre>
     */
    configureRequest: function(callback) {
      this.__configureRequestCallback = callback;
    },

    /**
     * Get request.
     *
     * May be overriden to change type of request.
     * @return {qx.bom.request.SimpleXhr|qx.io.request.AbstractRequest} Request object
     */
    _getRequest: function() {
      return (this.__begetRequest === null) ? new qx.bom.request.SimpleXhr()
                                            : this.__begetRequest();
    },

    /**
     * Create request.
     *
     * @param action {String} The action the created request is associated to.
     * @return {qx.bom.request.SimpleXhr|qx.io.request.AbstractRequest} Request object
     */
    __createRequest: function(action) {
      var req = this._getRequest();

      if (!qx.lang.Type.isArray(this.__requests[action])) {
        this.__requests[action] = [];
      }

      this.__requests[action].push(req);

      return req;
    },

    //
    // Routes and actions
    //

    /**
     * Map action to combination of method and URL pattern.
     *
     * <pre class="javascript">
     *   res.map("get", "GET", "/photos/{id}", {id: /\d+/});
     *
     *   // GET /photos/123
     *   res.get({id: "123"});
     * </pre>
     *
     * @param action {String} Action to associate to request.
     * @param method {String} Method to configure request with.
     * @param url {String} URL to configure request with. May contain positional
     *   parameters (<code>{param}</code>) that are replaced by values given when the action
     *   is invoked. Parameters are optional, unless a check is defined. A default
     *   value can be provided (<code>{param=default}</code>).
     * @param check {Map?} Map defining parameter constraints, where the key is
     *   the URL parameter and the value a regular expression (to match string) or
     *   <code>qx.bom.rest.Resource.REQUIRED</code> (to verify existence).
     */
    map: function(action, method, url, check) {
      this.__routes[action] = [method, url, check];

      // Track requests
      this.__requests[action] = [];

      // Undefine generic getter when action is named "get"
      if (action == "get") {
        this[action] = undefined;
      }

      // Do not overwrite existing "non-action" methods unless the method is
      // null (i.e. because it exists as a stub for documentation)
      if (typeof this[action] !== "undefined" && this[action] !== null &&
          this[action].action !== true)
      {
        throw new Error("Method with name of action (" +
          action + ") already exists");
      }

      this.__declareEvent(action + "Success");
      this.__declareEvent(action + "Error");

      this[action] = qx.lang.Function.bind(function() {
        Array.prototype.unshift.call(arguments, action);
        return this.invoke.apply(this, arguments);
      }, this);

      // Method is safe to overwrite
      this[action].action = true;
    },

    /**
     * Invoke action with parameters.
     *
     * Internally called by actions dynamically created.
     *
     * May be overriden to customize action and parameter handling.
     *
     * @lint ignoreUnused(successHandler, failHandler, loadEndHandler)
     *
     * @param action {String} Action to invoke.
     * @param params {Map} Map of parameters inserted into URL when a matching
     *  positional parameter is found.
     * @param data {Map|String} Data to be send as part of the request.
     *  See {@link qx.bom.request.SimpleXhr#getRequestData}.
     *  See {@link qx.io.request.AbstractRequest#requestData}.
     * @return {Number} Id of the action's invocation.
     */
    invoke: function(action, params, data) {
      var req = this.__createRequest(action),
          params = params == null ? {} : params,
          config = this._getRequestConfig(action, params);

      // Cache parameters
      this.__routes[action].params = params;

      // Check parameters
      this.__checkParameters(params, config.check);

      // Configure request
      this.__configureRequest(req, config, data);

      // Run configuration callback, passing in pre-configured request
      if (this.__configureRequestCallback) {
        this.__configureRequestCallback.call(this, req, action, params, data);
      }

      // Configure JSON request (content type may have been set in configuration callback)
      this.__configureJsonRequest(req, config, data);

      var reqHandler = this._getRequestHandler();

      // Handle successful request
      req.addListenerOnce(
        "success",
        reqHandler.onsuccess.callback(req, action),
        reqHandler.onsuccess.context
      );
      // Handle erroneous request
      req.addListenerOnce(
        "fail",
        reqHandler.onfail.callback(req, action),
        reqHandler.onfail.context
      );
      // Handle loadend (Note that loadEnd is fired after "success")
      req.addListenerOnce(
        "loadEnd",
        reqHandler.onloadend.callback(req, action),
        reqHandler.onloadend.context
      );

      req.send();

      return parseInt(req.toHashCode(), 10);
    },

    /**
     * Set base URL.
     *
     * The base URL is prepended to the URLs given in the description.
     * Changes affect all future invocations.
     *
     * @param baseUrl {String} Base URL.
     */
    setBaseUrl: function(baseUrl) {
      this.__baseUrl = baseUrl;
    },

    /**
     * Check parameters.
     *
     * @param params {Map} Parameters.
     * @param check {Map} Checks.
     */
    __checkParameters: function(params, check) {
      if(typeof check !== "undefined") {

        if (qx.core.Environment.get("qx.debug")) {
          qx.core.Assert.assertObject(check, "Check must be object with params as keys");
        }

        Object.keys(check).forEach(function(param) {

          // Warn about invalid check
          if (qx.core.Environment.get("qx.debug")) {
            if (check[param] !== true) {
              if (qx.core.Environment.get("qx.debug")) {
                qx.core.Assert.assertRegExp(check[param]);
              }
            }
          }

          // Missing parameter
          if (check[param] === qx.bom.rest.Resource.REQUIRED && typeof params[param] === "undefined") {
            throw new Error("Missing parameter '" + param + "'");
          }

          // Ignore invalid checks
          if (!(check[param] && typeof check[param].test == "function")) {
            return;
          }

          // Invalid parameter
          if (!check[param].test(params[param])) {
            throw new Error("Parameter '" + param + "' is invalid");
          }
        });
      }
    },

    /**
     * Configure request.
     *
     * @param req {qx.bom.request.SimpleXhr|qx.io.request.AbstractRequest} Request.
     * @param config {Map} Configuration.
     * @param data {Map} Data.
     */
    __configureRequest: function(req, config, data) {
      req.setUrl(config.url);

      if (!req.setMethod && config.method !== "GET") {
        throw new Error("Request (" + req.classname + ") doesn't support other HTTP methods than 'GET'");
      }

      if (req.setMethod) {
        req.setMethod(config.method);
      }

      if (data) {
        req.setRequestData(data);
      }
    },

    /**
     * Serialize data to JSON when content type indicates.
     *
     * @param req {qx.bom.request.SimpleXhr|qx.io.request.AbstractRequest} Request.
     * @param config {Map} Configuration.
     * @param data {Map} Data.
     */
    __configureJsonRequest: function(req, config, data) {
      if (data) {
        var contentType = req.getRequestHeader("Content-Type");

        if (req.getMethod && qx.util.Request.methodAllowsRequestBody(req.getMethod())) {
          if ((/application\/.*\+?json/).test(contentType)) {
            data = qx.lang.Json.stringify(data);
            req.setRequestData(data);
          }
        }
      }
    },

    /**
     * Abort action.
     *
     * Example:
     *
     * <pre class="javascript">
     *   // Abort all invocations of action
     *   res.get({id: 1});
     *   res.get({id: 2});
     *   res.abort("get");
     *
     *   // Abort specific invocation of action (by id)
     *   var actionId = res.get({id: 1});
     *   res.abort(actionId);
     * </pre>
     *
     * @param varargs {String|Number} Action of which all invocations to abort
     *  (when string), or a single invocation of an action to abort (when number)
     */
    abort: function(varargs) {
      if (qx.lang.Type.isNumber(varargs)) {
        var id = varargs;
        var post = qx.core.ObjectRegistry.getPostId();
        var req = qx.core.ObjectRegistry.fromHashCode(id + post);
        if (req) {
          req.abort();
        }
      } else {
        var action = varargs;
        var reqs = this.__requests[action];
        if (this.__requests[action]) {
          reqs.forEach(function(req) {
            req.abort();
          });
        }
      }
    },

    /**
     * Resend request associated to action.
     *
     * Replays parameters given when action was invoked originally.
     *
     * @param action {String} Action to refresh.
     */
    refresh: function(action) {
      this.invoke(action, this.__routes[action].params);
    },

    /**
     * Periodically invoke action.
     *
     * Replays parameters given when action was invoked originally. When the
     * action was not yet invoked and requires parameters, parameters must be
     * given.
     *
     * Please note that IE tends to cache overly agressive. One work-around is
     * to disable caching on the client side by configuring the request with
     * <code>setCache(false)</code>. If you control the server, a better
     * work-around is to include appropriate headers to explicitly control
     * caching. This way you still avoid requests that can be correctly answered
     * from cache (e.g. when nothing has changed since the last poll). Please
     * refer to <a href="http://www.mnot.net/javascript/xmlhttprequest/cache.html">
     * XMLHttpRequest Caching Test</a> for available options.
     *
     * @lint ignoreUnused(intervalListener)
     *
     * @param action {String} Action to poll.
     * @param interval {Number} Interval in ms.
     * @param params {Map?} Map of parameters. See {@link #invoke}.
     * @param immediately {Boolean?false} <code>true</code>, if the poll should
     *   invoke a call immediately.
     */
    poll: function(action, interval, params, immediately) {
      // Dispose timer previously created for action
      if (this.__pollTimers[action]) {
        this.stopPollByAction(action);
      }

      // Fallback to previous params
      if (typeof params == "undefined") {
        params = this.__routes[action].params;
      }

      // Invoke immediately
      if (immediately) {
        this.invoke(action, params);
      }

      var intervalListener = (function(scope) {
        return function() {
          var req = scope.__requests[action][0];
          if (!immediately && !req) {
            scope.invoke(action, params);
            return;
          }
          if (req.isDone() || req.isDisposed()) {
            scope.refresh(action);
          }
        };
      })(this);

      this._startPoll(action, intervalListener, interval);
    },


    /**
     * Start a poll process.
     *
     * @param action {String} Action to poll.
     * @param listener {Function} The function to repeatedly execute at the given interval.
     * @param interval {Number} Interval in ms.
     */
    _startPoll: function(action, listener, interval) {
      this.__pollTimers[action] = {
        "id": window.setInterval(listener, interval),
        "interval": interval,
        "listener": listener
      };
    },

    /**
     * Stops a poll process by the associated action.
     *
     * @param action {String} Action to poll.
     */
    stopPollByAction: function(action) {
      if (action in this.__pollTimers) {
        var intervalId = this.__pollTimers[action].id;
        window.clearInterval(intervalId);
      }
    },

    /**
     * Restarts a poll process by the associated action.
     *
     * @param action {String} Action to poll.
     */
    restartPollByAction: function(action) {
      if (action in this.__pollTimers) {
        var timer = this.__pollTimers[action];
        this.stopPollByAction(action);
        this._startPoll(action, timer.listener, timer.interval);
      }
    },

    /**
     * Long-poll action.
     *
     * Use Ajax long-polling to continously fetch a resource as soon as the
     * server signals new data. The server determines when new data is available,
     * while the client keeps open a request. Requires configuration on the
     * server side. Basically, the server must not close a connection until
     * new data is available. For a high level introduction to long-polling,
     * refer to <a href="http://en.wikipedia.org/wiki/Comet_(programming)#Ajax_with_long_polling">
     * Ajax with long polling</a>.
     *
     * Uses {@link #refresh} internally. Make sure you understand the
     * implications of IE's tendency to cache overly agressive.
     *
     * Note no interval is given on the client side.
     *
     * @lint ignoreUnused(longPollHandler)
     *
     * @param action {String} Action to poll.
     * @return {String} Id of handler responsible for long-polling. To stop
     *  polling, remove handler using {@link qx.core.Object#removeListenerById}.
     */
    longPoll: function(action) {
      var res = this,
          lastResponse,               // Keep track of last response
          immediateResponseCount = 0; // Count immediate responses

      // Throttle to prevent high load on server and client
      function throttle() {
        var isImmediateResponse =
          lastResponse &&
          ((new Date()) - lastResponse) < res._getThrottleLimit();

        if (isImmediateResponse) {
          immediateResponseCount += 1;
          if (immediateResponseCount > res._getThrottleCount()) {
            if (qx.core.Environment.get("qx.debug")) {
              qx.Bootstrap.debug("Received successful response more than " +
                res._getThrottleCount() + " times subsequently, each within " +
                res._getThrottleLimit() + " ms. Throttling.");
            }
            return true;
          }
        }

        // Reset counter on delayed response
        if (!isImmediateResponse) {
          immediateResponseCount = 0;
        }

        return false;
      }

      var handlerId = this.__longPollHandlers[action] =
        this.addListener(action + "Success", function longPollHandler() {
          if (res.isDisposed()) {
            return;
          }

          if (!throttle()) {
            lastResponse = new Date();
            res.refresh(action);
          }
        });

      this.invoke(action);
      return handlerId;
    },

    /**
     * Get request configuration for action and parameters.
     *
     * This is were placeholders are replaced with parameters.
     *
     * @param action {String} Action associated to request.
     * @param params {Map} Parameters to embed in request.
     * @return {Map} Map of configuration settings. Has the properties
     *   <code>method</code>, <code>url</code> and <code>check</code>.
     */
    _getRequestConfig: function(action, params) {
      var route = this.__routes[action];

      // Not modify original params
      var params = qx.lang.Object.clone(params);

      if (!qx.lang.Type.isArray(route)) {
        throw new Error("No route for action " + action);
      }

      var method = route[0],
          url = this.__baseUrl !== null ? this.__baseUrl + route[1] : route[1],
          check = route[2],
          placeholders = qx.bom.rest.Resource.placeholdersFromUrl(url);

      params = params || {};

      placeholders.forEach(function(placeholder) {
        // Placeholder part of template and default value
        var re = new RegExp("{" + placeholder + "=?(\\w+)?}"),
            defaultValue = url.match(re)[1];

        // Fill in default or empty string when missing
        if (typeof params[placeholder] === "undefined") {
          if (defaultValue) {
            params[placeholder] = defaultValue;
          } else {
            params[placeholder] = "";
          }
        }

        url = url.replace(re, params[placeholder]);
      });

      return {method: method, url: url, check: check};
    },

    /**
     * Override to adjust the throttle limit.
     * @return {Integer} Throttle limit in milliseconds
     */
    _getThrottleLimit: function() {
      return qx.bom.rest.Resource.POLL_THROTTLE_LIMIT;
    },

    /**
     * Override to adjust the throttle count.
     * @return {Integer} Throttle count
     */
    _getThrottleCount: function() {
      return qx.bom.rest.Resource.POLL_THROTTLE_COUNT;
    },

    /**
     * Map actions from description.
     *
     * Allows to decoratively define routes.
     *
     * @param description {Map} Map that defines the routes.
     */
    __mapFromDescription: function(description) {
      Object.keys(description).forEach(function(action) {
        var route = description[action],
            method = route.method,
            url = route.url,
            check = route.check;

        if (qx.core.Environment.get("qx.debug")) {
          qx.core.Assert.assertString(method, "Method must be string for route '" + action + "'");
          qx.core.Assert.assertString(url, "URL must be string for route '" + action + "'");
        }

        this.map(action, method, url, check);
      }, this);
    },

    /**
     * Declare event at runtime.
     *
     * @param type {String} Type of event.
     */
    __declareEvent: function(type) {
      if (!this.constructor.$$events) {
        this.constructor.$$events = {};
      }

      if (!this.constructor.$$events[type]) {
        this.constructor.$$events[type] = "qx.bom.rest.Resource";
      }
    },

    /*
    ---------------------------------------------------------------------------
      DISPOSER
    ---------------------------------------------------------------------------
    */

    /**
     * Returns true if the object is disposed.
     *
     * @return {Boolean} Whether the object has been disposed
     */
    isDisposed : function() {
      return this.$$disposed || false;
    },


    /**
     * Dispose this object
     *
     */
    dispose : function()
    {
      // Check first
      if (this.$$disposed) {
        return;
      }

      // Mark as disposed (directly, not at end, to omit recursions)
      this.$$disposed = true;

      // Debug output
      if (qx.core.Environment.get("qx.debug"))
      {
        if (qx.core.Environment.get("qx.debug.dispose.level") > 2) {
          qx.Bootstrap.debug(this, "Disposing " + this.classname + "[" + this.toHashCode() + "]");
        }
      }

      this.destruct();

      // Additional checks
      if (qx.core.Environment.get("qx.debug"))
      {
        if (qx.core.Environment.get("qx.debug.dispose.level") > 0)
        {
          var key, value;
          for (key in this)
          {
            value = this[key];

            // Check for Objects but respect values attached to the prototype itself
            if (value !== null && typeof value === "object" && !(qx.Bootstrap.isString(value)))
            {
              // Check prototype value
              // undefined is the best, but null may be used as a placeholder for
              // private variables (hint: checks in qx.Class.define). We accept both.
              if (this.constructor.prototype[key] != null) {
                continue;
              }

              var ff2 = navigator.userAgent.indexOf("rv:1.8.1") != -1;
              var ie6 = navigator.userAgent.indexOf("MSIE 6.0") != -1;
              // keep the old behavior for IE6 and FF2
              if (ff2 || ie6) {
                if (value instanceof qx.core.Object || qx.core.Environment.get("qx.debug.dispose.level") > 1) {
                  qx.Bootstrap.warn(this, "Missing destruct definition for '" + key + "' in " + this.classname + "[" + this.toHashCode() + "]: " + value);
                  delete this[key];
                }
              } else {
                if (qx.core.Environment.get("qx.debug.dispose.level") > 1) {
                  qx.Bootstrap.warn(this, "Missing destruct definition for '" + key + "' in " + this.classname + "[" + this.toHashCode() + "]: " + value);
                  delete this[key];
                }
              }
            }
          }
        }
      }
    },

    /**
     * Desctructs the Resource.
     *
     * All created requests, routes and pollTimers will be disposed.
     */
    destruct: function() {
      var action;

      for (action in this.__requests) {
        if (this.__requests[action]) {
          this.__requests[action].forEach(function(req) {
            req.dispose();
          });
        }
      }

      if (this.__pollTimers) {
        for (action in this.__pollTimers) {
          this.stopPollByAction(action);
        }
      }

      if (this.__longPollHandlers) {
        for (action in this.__longPollHandlers) {
          var id = this.__longPollHandlers[action];
          this.removeListenerById(id);
        }
      }

      this.__requests = this.__routes = this.__pollTimers = null;
    }
  }
});
/* ************************************************************************

   baseLib - enterprise-proven low-level library


   http://1und1.de

   Copyright:
     2013 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     commercial

   Authors:
     * Alexander Steitz (aback)
     * Romeo Kenfack Tsakem (rkenfack)

************************************************************************ */

  /**
  * Wrapper class for qooxdoo REST API
  *
  */

  qx.Bootstrap.define("baselib.Rest", {

    extend : qx.bom.rest.Resource,

    /**
    * Creates a new instance of Rest
    *
    * Example:
    * <pre class="javascript">
    *
    * var description = {
    *    "getItem": { method: "GET", url: "/photo/{id}",headers: {"Content-Type":"application/x-www-form-urlencoded"}},
    *    "putItem": { method: "POST", url: "/photo/{id}", check: { id: /\d+/ } },
    *    "postItem": { method: "POST", url: "/photos/",headers: {"Content-Type":"application/json"}}
    * };
    *
    * var resource =  q.rest(description);
    *
    * resource.setRequestHeaders({ "putItem" : {"Content-Type" : "application/json"} });
    *
    * resource.getItem({id:1});
    *
    * </pre>
    *
    * @param desc {Map} The map containing the description of the resource.
    * Each key of the map is interpreted as action name. The value associated to the key
    * must be a map with the properties method and url. check and headers are optional
    */
    construct : function(desc)
    {
      this.__headers = {};
      this.__fakeResponses = {};

      this.__description = desc;

      var clazz = baselib.Rest;

      //Checking for headers and mock data
      for(var p in desc){
        if(desc[p].headers){
          this.__headers[p] = desc[p].headers;
        }
        if(clazz.__CanUseFakeServer && desc[p].mock){
          this.__fakeResponses[p] = desc[p].mock;
          qxWeb.dev.fakeServer.configure(this.__generateMockData());
        }
      }

      //Calling constructor of the superClass
      qx.bom.rest.Resource.apply(this, arguments);

      this.__configured = false;

      //Wrapping configurerequest to inject the request headers
      /*jshint loopfunc:true */
      for(var o in desc)
      {
        (function(o,self){

          if(self[o])
          {
            var restCall = self[o];

            self[o] = function()
            {
              if(!self.__configured)
              {
                var callBack = this.__configureRequestCallback;
                self.configureRequest(function(req) {
                  for(var key in self.__headers[o]){
                    req.setRequestHeader(key, self.__headers[o][key]);
                  }
                  if(callBack){
                    callBack.apply(self, arguments);
                  }
                });
                self.__configured = true;
              }
              restCall.apply(self, arguments);
            };
          }
        })(o,this);
      }
    },


    statics : {

      /*
      * Determines if the fakeServer is available or not
      */
      __CanUseFakeServer : (typeof qxWeb.dev === "object" &&  typeof qxWeb.dev.fakeServer === "object"),

      /**
      * Creates a new instance of a resource
      * @param desc {Map} The map containing the description of the resource.
      * Each key of the map is interpreted as action name. The value associated to the key
      * must be a map with the properties method and url. check and headers are optional
      * @attachStatic{qxWeb, rest}
      * @return {baselib.Rest} rest instance
      */
      resource : function(desc){
        return new baselib.Rest(desc);
      }
    },


    members :
    {
      __description : null,
      __headers : null,
      __fakeResponses : null,
      __configured : false,

     /**
      * Set request headers for specific actions. The keys of the map must be action's names defined
      * in the resource description.
      *
      * Example:
      *
      * <pre class="javascript">
      *  var description = {
      *     "getItem": { method: "GET", url: "/photo/{id}"},
      *     "putItem": { method: "POST", url: "/photo/{id}"},
      *     "postItem": { method: "POST", url: "/photos/"}
      *  };
      *  var resource =  q.rest(description);
      *  resource.setRequestHeaders({ "getItem" : {"Content-Type" : "application/json"} });
      *  resource.getItem({id:1});
      * </pre>
      *
      * @param headers {Map} The map containing the headers
      */
      setRequestHeaders : function(headers){
        for(var key in headers){
          this.__headers[key] = headers[key];
        }
      },

      /**
      * Enables and configures the fakeServer for specific actions
      *
      * Example:
      * <pre>
      *    var responses =  {
      *     getItem : {
      *        status : 200,
      *        headers : { "Content-Type": "application/json" },
      *        responseData : {
      *          user : {
      *            lastname : "Doe",
      *            firstname :"John"
      *          }
      *        }
      *      },
      *
      *      postItem : {
      *        status : 200,
      *        headers : { "Content-Type": "application/json" },
      *        responseData : {
      *          user : {
      *            lastname : "Doe",
      *            firstname :"John"
      *          }
      *        }
      *      }
      *    };
      *    var resource = q.rest({"getItem": { method: "GET", url: "/photo/{id}"}});
      *    resource.fakeRequests(responses);
      *    resource.getItem({id:1});
      *  </pre>
      *
      * @param responses {Map} The map containing the mock data of the actions to be faked
      */
      fakeRequests : function(responses){
        if(baselib.Rest.__CanUseFakeServer){
          this.__fakeResponses = responses;
          qxWeb.dev.fakeServer.configure(this.__generateMockData());
        }
      },

      /**
      * Stops faking requests for a specific action
      * @param key {String} The action's name
      */
      restoreRequest : function(key){
        //TODO Modify this to restore the native xhr for specified urls only (removeFilter)
        if(this.__description[key]){
           qxWeb.dev.fakeServer.removeResponse(this.__description[key].method,this.__description[key].url);
        }
      },

      /**
      * Stops faking requests for all actions of the resource
      */
      restoreAll : function(){
        for(var key in this.__description){
          this.restoreRequest(key);
        }
      },

      /**
      * Generate mock data for the fakeServer
      * @return {Map} Map containing a response's description of the fake server
      */
      __generateMockData : function(){

        var mockData = [], res = {}, mock = {};

        for(var key in this.__fakeResponses){

          res = {};
          mock = this.__fakeResponses[key];

          if(this.__description[key]){

            res.method = this.__description[key].method;
            res.url = this.__description[key].url;
            res.response = [mock.status,mock.headers,qx.lang.Json.stringify(mock.responseData)];
            mockData.push(res);
          }
        }
        return mockData;
      }

    },

    defer : function(statics){
      qxWeb.$attachStatic({
        rest : statics.resource
      });
    }
  }
);
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Martin Wittemann (martinwittemann)

************************************************************************ */
/**
 * Contains detection for QuickTime, Windows Media, DivX, Silverlight adn gears.
 * If no version could be detected the version is set to an empty string as
 * default.
 *
 * This class is used by {@link qx.core.Environment} and should not be used
 * directly. Please check its class comment for details how to use it.
 *
 * @internal
 */
qx.Bootstrap.define("qx.bom.client.Plugin",
{
  statics :
  {
    /**
     * Checkes for the availability of google gears plugin.
     *
     * @internal
     * @return {Boolean} <code>true</code> if gears is available
     */
    getGears : function() {
      return !!(window.google && window.google.gears);
    },


    /**
     * Checks for ActiveX availability.
     *
     * @internal
     * @return {Boolean} <code>true</code> if ActiveX is available
     */
    getActiveX : function()
    {
      if (typeof window.ActiveXObject === "function") {
        return true;
      }
      try {
        // in IE11 Preview, ActiveXObject is undefined but instances can
        // still be created
        return (typeof (new window.ActiveXObject("Microsoft.XMLHTTP")) === "object" ||
          typeof (new window.ActiveXObject("MSXML2.DOMDocument.6.0")) === "object");
      } catch(ex) {
        return false;
      }
    },

    /**
     * Checks for Skypes 'Click to call' availability.
     *
     * @internal
     * @return {Boolean} <code>true</code> if the plugin is available.
     */
    getSkype : function()
    {
      // IE Support
      if (qx.bom.client.Plugin.getActiveX()) {
       try {
         new ActiveXObject("Skype.Detection");
         return true;
       } catch (e) {}
      }

      var mimeTypes = navigator.mimeTypes;
      if (mimeTypes) {
        // FF support
        if ("application/x-skype" in mimeTypes) {
          return true;
        }
        // webkit support
        for (var i=0; i < mimeTypes.length; i++) {
          var desc = mimeTypes[i];
          if (desc.type.indexOf("skype.click2call") != -1) {
            return true;
          }
        };
      }

      return false;
    },


    /**
     * Database of supported features.
     * Filled with additional data at initialization
     */
    __db :
    {
      quicktime :
      {
        plugin : [ "QuickTime" ],
        control : "QuickTimeCheckObject.QuickTimeCheck.1"
        // call returns boolean: instance.IsQuickTimeAvailable(0)
      },

      wmv :
      {
        plugin : [ "Windows Media" ],
        control : "WMPlayer.OCX.7"
        // version string in: instance.versionInfo
      },

      divx :
      {
        plugin : [ "DivX Web Player" ],
        control : "npdivx.DivXBrowserPlugin.1"
      },

      silverlight :
      {
        plugin : [ "Silverlight" ],
        control : "AgControl.AgControl"
        // version string in: instance.version (Silverlight 1.0)
        // version string in: instance.settings.version (Silverlight 1.1)
        // version check possible using instance.IsVersionSupported
      },

      pdf :
      {
        plugin : [ "Chrome PDF Viewer", "Adobe Acrobat" ],
        control : "AcroPDF.PDF"
        // this is detecting Acrobat PDF version > 7 and Chrome PDF Viewer
      }
    },


    /**
     * Fetches the version of the quicktime plugin.
     * @return {String} The version of the plugin, if available,
     *   an empty string otherwise
     * @internal
     */
    getQuicktimeVersion : function() {
      var entry = qx.bom.client.Plugin.__db["quicktime"];
      return qx.bom.client.Plugin.__getVersion(entry.control, entry.plugin);
    },


    /**
     * Fetches the version of the windows media plugin.
     * @return {String} The version of the plugin, if available,
     *   an empty string otherwise
     * @internal
     */
    getWindowsMediaVersion : function() {
      var entry = qx.bom.client.Plugin.__db["wmv"];
      return qx.bom.client.Plugin.__getVersion(entry.control, entry.plugin);
    },


    /**
     * Fetches the version of the divx plugin.
     * @return {String} The version of the plugin, if available,
     *   an empty string otherwise
     * @internal
     */
    getDivXVersion : function() {
      var entry = qx.bom.client.Plugin.__db["divx"];
      return qx.bom.client.Plugin.__getVersion(entry.control, entry.plugin);
    },


    /**
     * Fetches the version of the silverlight plugin.
     * @return {String} The version of the plugin, if available,
     *   an empty string otherwise
     * @internal
     */
    getSilverlightVersion : function() {
      var entry = qx.bom.client.Plugin.__db["silverlight"];
      return qx.bom.client.Plugin.__getVersion(entry.control, entry.plugin);
    },


    /**
     * Fetches the version of the pdf plugin.
     * @return {String} The version of the plugin, if available,
     *  an empty string otherwise
     * @internal
     */
    getPdfVersion : function() {
      var entry = qx.bom.client.Plugin.__db["pdf"];
      return qx.bom.client.Plugin.__getVersion(entry.control, entry.plugin);
    },


    /**
     * Checks if the quicktime plugin is available.
     * @return {Boolean} <code>true</code> if the plugin is available
     * @internal
     */
    getQuicktime : function() {
      var entry = qx.bom.client.Plugin.__db["quicktime"];
      return qx.bom.client.Plugin.__isAvailable(entry.control, entry.plugin);
    },


    /**
     * Checks if the windows media plugin is available.
     * @return {Boolean} <code>true</code> if the plugin is available
     * @internal
     */
    getWindowsMedia : function() {
      var entry = qx.bom.client.Plugin.__db["wmv"];
      return qx.bom.client.Plugin.__isAvailable(entry.control, entry.plugin);
    },


    /**
     * Checks if the divx plugin is available.
     * @return {Boolean} <code>true</code> if the plugin is available
     * @internal
     */
    getDivX : function() {
      var entry = qx.bom.client.Plugin.__db["divx"];
      return qx.bom.client.Plugin.__isAvailable(entry.control, entry.plugin);
    },


    /**
     * Checks if the silverlight plugin is available.
     * @return {Boolean} <code>true</code> if the plugin is available
     * @internal
     */
    getSilverlight : function() {
      var entry = qx.bom.client.Plugin.__db["silverlight"];
      return qx.bom.client.Plugin.__isAvailable(entry.control, entry.plugin);
    },


    /**
     * Checks if the pdf plugin is available.
     * @return {Boolean} <code>true</code> if the plugin is available
     * @internal
     */
    getPdf : function() {
      var entry = qx.bom.client.Plugin.__db["pdf"];
      return qx.bom.client.Plugin.__isAvailable(entry.control, entry.plugin);
    },


    /**
     * Internal helper for getting the version of a given plugin.
     *
     * @param activeXName {String} The name which should be used to generate
     *   the test ActiveX Object.
     * @param pluginNames {Array} The names with which the plugins are listed in
     *   the navigator.plugins list.
     * @return {String} The version of the plugin as string.
     */
    __getVersion : function(activeXName, pluginNames) {
      var available = qx.bom.client.Plugin.__isAvailable(
        activeXName, pluginNames
      );
      // don't check if the plugin is not available
      if (!available) {
        return "";
      }

      // IE checks
      if (qx.bom.client.Engine.getName() == "mshtml") {
        var obj = new ActiveXObject(activeXName);

        try {
          var version = obj.versionInfo;
          if (version != undefined) {
            return version;
          }

          version = obj.version;
          if (version != undefined) {
            return version;
          }

          version = obj.settings.version;
          if (version != undefined) {
            return version;
          }
        } catch (ex) {
          return "";
        }

        return "";

      // all other browsers
      } else {
        var plugins = navigator.plugins;

        var verreg = /([0-9]\.[0-9])/g;
        for (var i = 0; i < plugins.length; i++)
        {
          var plugin = plugins[i];

          for (var j = 0; j < pluginNames.length; j++)
          {
            if (plugin.name.indexOf(pluginNames[j]) !== -1)
            {
              if (verreg.test(plugin.name) || verreg.test(plugin.description)) {
                return RegExp.$1;
              }
            }
          }
        }

        return "";
      }
    },


    /**
     * Internal helper for getting the availability of a given plugin.
     *
     * @param activeXName {String} The name which should be used to generate
     *   the test ActiveX Object.
     * @param pluginNames {Array} The names with which the plugins are listed in
     *   the navigator.plugins list.
     * @return {Boolean} <code>true</code>, if the plugin available
     */
    __isAvailable : function(activeXName, pluginNames) {
      // IE checks
      if (qx.bom.client.Engine.getName() == "mshtml") {

        var control = window.ActiveXObject;
        if (!control) {
          return false;
        }

        try {
          new ActiveXObject(activeXName);
        } catch(ex) {
          return false;
        }

        return true;
      // all other
      } else {

        var plugins = navigator.plugins;
        if (!plugins) {
          return false;
        }

        var name;
        for (var i = 0; i < plugins.length; i++)
        {
          name = plugins[i].name;

          for (var j = 0; j < pluginNames.length; j++)
          {
            if (name.indexOf(pluginNames[j]) !== -1) {
              return true;
            }
          }
        }

        return false;
      }
    }
  },

  defer : function(statics) {
    qx.core.Environment.add("plugin.gears", statics.getGears);
    qx.core.Environment.add("plugin.quicktime", statics.getQuicktime);
    qx.core.Environment.add("plugin.quicktime.version", statics.getQuicktimeVersion);
    qx.core.Environment.add("plugin.windowsmedia", statics.getWindowsMedia);
    qx.core.Environment.add("plugin.windowsmedia.version", statics.getWindowsMediaVersion);
    qx.core.Environment.add("plugin.divx", statics.getDivX);
    qx.core.Environment.add("plugin.divx.version", statics.getDivXVersion);
    qx.core.Environment.add("plugin.silverlight", statics.getSilverlight);
    qx.core.Environment.add("plugin.silverlight.version", statics.getSilverlightVersion);
    qx.core.Environment.add("plugin.pdf", statics.getPdf);
    qx.core.Environment.add("plugin.pdf.version", statics.getPdfVersion);
    qx.core.Environment.add("plugin.activex", statics.getActiveX);
    qx.core.Environment.add("plugin.skype", statics.getSkype);
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Tristan Koch (tristankoch)

************************************************************************ */

/**
 * JSON detection.
 *
 * This class is used by {@link qx.core.Environment} and should not be used
 * directly. Please check its class comment for details how to use it.
 *
 * @internal
 */
qx.Bootstrap.define("qx.bom.client.Json",
{
  statics:
  {
    /**
     * Checks if native JSON could be used and is full-featured.
     * @return {Boolean} <code>true</code>, if it could be used.
     * @internal
     */
    getJson: function() {
      return (

      // Exists
      qx.Bootstrap.getClass(window.JSON) == "JSON" &&

      // Can parse
      JSON.parse('{"x":1}').x === 1 &&

      // Supports replacer
      //
      // Catches browser bug found in Firefox >=3.5 && < 4, see
      // https://bugzilla.mozilla.org/show_bug.cgi?id=509184
      JSON.stringify({"prop":"val"}, function(k,v) {
        return k === "prop" ? "repl" : v;
      }).indexOf("repl") > 0);
    }
  },

  defer : function(statics) {
    qx.core.Environment.add("json", statics.getJson);
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2013 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Fabian Jakobs (fjakobs)
     * Richard Sternagel (rsternagel)

   ======================================================================

   This class contains code from:

   * JSON 3 (v3.2.5)

     Code:
       https://github.com/bestiejs/json3

     Copyright:
       (c) 2012-2013, Kit Cambridge

     License:
       MIT: https://raw.github.com/bestiejs/json3/gh-pages/LICENSE

   ----------------------------------------------------------------------

    Copyright (c) 2012-2013 Kit Cambridge.
    http://kitcambridge.be/

    Permission is hereby granted, free of charge, to any person obtaining a copy of
    this software and associated documentation files (the "Software"), to deal in
    the Software without restriction, including without limitation the rights to
    use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
    of the Software, and to permit persons to whom the Software is furnished to do
    so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

************************************************************************ */

/**
 * Exposes (potentially polyfilled or patched) window.JSON to qooxdoo
 * (enabled by <a href="https://github.com/bestiejs/json3">JSON 3</a>).
 */
qx.Bootstrap.define("qx.lang.Json",
{
  statics :
  {
    /**
     * This method produces a JSON text from a JavaScript value.
     *
     * When an object value is found, if the object contains a toJSON
     * method, its toJSON method will be called and the result will be
     * stringified. A toJSON method does not serialize: it returns the
     * value represented by the name/value pair that should be serialized,
     * or undefined if nothing should be serialized. The toJSON method
     * will be passed the key associated with the value, and this will be
     * bound to the object holding the key.
     *
     * For example, this would serialize Dates as ISO strings.
     *
     * <pre class="javascript">
     *     Date.prototype.toJSON = function (key) {
     *         function f(n) {
     *             // Format integers to have at least two digits.
     *             return n < 10 ? '0' + n : n;
     *         }
     *
     *         return this.getUTCFullYear()   + '-' +
     *              f(this.getUTCMonth() + 1) + '-' +
     *              f(this.getUTCDate())      + 'T' +
     *              f(this.getUTCHours())     + ':' +
     *              f(this.getUTCMinutes())   + ':' +
     *              f(this.getUTCSeconds())   + 'Z';
     *     };
     * </pre>
     *
     * You can provide an optional replacer method. It will be passed the
     * key and value of each member, with this bound to the containing
     * object. The value that is returned from your method will be
     * serialized. If your method returns undefined, then the member will
     * be excluded from the serialization.
     *
     * If the replacer parameter is an array of strings, then it will be
     * used to select the members to be serialized. It filters the results
     * such that only members with keys listed in the replacer array are
     * stringified.
     *
     * Values that do not have JSON representations, such as undefined or
     * functions, will not be serialized. Such values in objects will be
     * dropped; in arrays they will be replaced with null. You can use
     * a replacer function to replace those with JSON values.
     * JSON.stringify(undefined) returns undefined.
     *
     * The optional space parameter produces a stringification of the
     * value that is filled with line breaks and indentation to make it
     * easier to read.
     *
     * If the space parameter is a non-empty string, then that string will
     * be used for indentation. If the space parameter is a number, then
     * the indentation will be that many spaces.
     *
     * Example:
     *
     * <pre class="javascript">
     * text = JSON.stringify(['e', {pluribus: 'unum'}]);
     * // text is '["e",{"pluribus":"unum"}]'
     *
     *
     * text = JSON.stringify(['e', {pluribus: 'unum'}], null, '\t');
     * // text is '[\n\t"e",\n\t{\n\t\t"pluribus": "unum"\n\t}\n]'
     *
     * text = JSON.stringify([new Date()], function (key, value) {
     *     return this[key] instanceof Date ?
     *         'Date(' + this[key] + ')' : value;
     * });
     * // text is '["Date(---current time---)"]'
     * </pre>
     *
     * @signature function(value, replacer, space)
     *
     * @param value {var} any JavaScript value, usually an object or array.
     *
     * @param replacer {Function?} an optional parameter that determines how
     *    object values are stringified for objects. It can be a function or an
     *    array of strings.
     *
     * @param space {String?} an optional parameter that specifies the
     *    indentation of nested structures. If it is omitted, the text will
     *    be packed without extra whitespace. If it is a number, it will specify
     *    the number of spaces to indent at each level. If it is a string
     *    (such as '\t' or '&nbsp;'), it contains the characters used to indent
     *    at each level.
     *
     * @return {String} The JSON string of the value
     */
    stringify : null, // will be set after the polyfill


    /**
     * This method parses a JSON text to produce an object or array.
     * It can throw a SyntaxError exception.
     *
     * The optional reviver parameter is a function that can filter and
     * transform the results. It receives each of the keys and values,
     * and its return value is used instead of the original value.
     * If it returns what it received, then the structure is not modified.
     * If it returns undefined then the member is deleted.
     *
     * Example:
     *
     * <pre class="javascript">
     * // Parse the text. Values that look like ISO date strings will
     * // be converted to Date objects.
     *
     * myData = JSON.parse(text, function (key, value)
     * {
     *   if (typeof value === 'string')
     *   {
     *     var a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
     *     if (a) {
     *       return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]));
     *     }
     *   }
     *   return value;
     * });
     *
     * myData = JSON.parse('["Date(09/09/2001)"]', function (key, value) {
     *     var d;
     *     if (typeof value === 'string' &&
     *             value.slice(0, 5) === 'Date(' &&
     *             value.slice(-1) === ')') {
     *         d = new Date(value.slice(5, -1));
     *         if (d) {
     *             return d;
     *         }
     *     }
     *     return value;
     * });
     * </pre>
     *
     * @signature function(text, reviver)
     *
     * @param text {String} JSON string to parse
     *
     * @param reviver {Function?} Optional reviver function to filter and
     *    transform the results
     *
     * @return {Object} The parsed JSON object
     */
    parse : null // will be set after the polyfill
  }
});

/*! JSON v3.2.5 | http://bestiejs.github.io/json3 | Copyright 2012-2013, Kit Cambridge | http://kit.mit-license.org */
/**
 * @ignore(define.*, exports)
 * @lint ignoreNoLoopBlock()
 */
(function (window) {
  // Convenience aliases.
  var getClass = {}.toString, isProperty, forEach, undef;

  // Detect the `define` function exposed by asynchronous module loaders. The
  // strict `define` check is necessary for compatibility with `r.js`.
  var isLoader = typeof define === "function" && define.amd, JSON3 = typeof exports == "object" && exports;

  if (JSON3 || isLoader) {
    if (typeof JSON == "object" && JSON) {
      // Delegate to the native `stringify` and `parse` implementations in
      // asynchronous module loaders and CommonJS environments.
      if (JSON3) {
        JSON3.stringify = JSON.stringify;
        JSON3.parse = JSON.parse;
      } else {
        JSON3 = JSON;
      }
    } else if (isLoader) {
      JSON3 = window.JSON = {};
    }
  } else {
    // Export for web browsers and JavaScript engines.
    JSON3 = window.JSON || (window.JSON = {});
  }

  // Test the `Date#getUTC*` methods. Based on work by @Yaffle.
  var isExtended = new Date(-3509827334573292);
  try {
    // The `getUTCFullYear`, `Month`, and `Date` methods return nonsensical
    // results for certain dates in Opera >= 10.53.
    isExtended = isExtended.getUTCFullYear() == -109252 && isExtended.getUTCMonth() === 0 && isExtended.getUTCDate() === 1 &&
      // Safari < 2.0.2 stores the internal millisecond time value correctly,
      // but clips the values returned by the date methods to the range of
      // signed 32-bit integers ([-2 ** 31, 2 ** 31 - 1]).
      isExtended.getUTCHours() == 10 && isExtended.getUTCMinutes() == 37 && isExtended.getUTCSeconds() == 6 && isExtended.getUTCMilliseconds() == 708;
  } catch (exception) {}

  // Internal: Determines whether the native `JSON.stringify` and `parse`
  // implementations are spec-compliant. Based on work by Ken Snyder.
  function has(name) {
    if (name == "bug-string-char-index") {
      // IE <= 7 doesn't support accessing string characters using square
      // bracket notation. IE 8 only supports this for primitives.
      return "a"[0] != "a";
    }
    var value, serialized = '{"a":[1,true,false,null,"\\u0000\\b\\n\\f\\r\\t"]}', isAll = name == "json";
    if (isAll || name == "json-stringify" || name == "json-parse") {
      // Test `JSON.stringify`.
      if (name == "json-stringify" || isAll) {
        var stringify = JSON3.stringify, stringifySupported = typeof stringify == "function" && isExtended;
        if (stringifySupported) {
          // A test function object with a custom `toJSON` method.
          (value = function () {
            return 1;
          }).toJSON = value;
          try {
            stringifySupported =
              // Firefox 3.1b1 and b2 serialize string, number, and boolean
              // primitives as object literals.
              stringify(0) === "0" &&
              // FF 3.1b1, b2, and JSON 2 serialize wrapped primitives as object
              // literals.
              stringify(new Number()) === "0" &&
              stringify(new String()) == '""' &&
              // FF 3.1b1, 2 throw an error if the value is `null`, `undefined`, or
              // does not define a canonical JSON representation (this applies to
              // objects with `toJSON` properties as well, *unless* they are nested
              // within an object or array).
              stringify(getClass) === undef &&
              // IE 8 serializes `undefined` as `"undefined"`. Safari <= 5.1.7 and
              // FF 3.1b3 pass this test.
              stringify(undef) === undef &&
              // Safari <= 5.1.7 and FF 3.1b3 throw `Error`s and `TypeError`s,
              // respectively, if the value is omitted entirely.
              stringify() === undef &&
              // FF 3.1b1, 2 throw an error if the given value is not a number,
              // string, array, object, Boolean, or `null` literal. This applies to
              // objects with custom `toJSON` methods as well, unless they are nested
              // inside object or array literals. YUI 3.0.0b1 ignores custom `toJSON`
              // methods entirely.
              stringify(value) === "1" &&
              stringify([value]) == "[1]" &&
              // Prototype <= 1.6.1 serializes `[undefined]` as `"[]"` instead of
              // `"[null]"`.
              stringify([undef]) == "[null]" &&
              // YUI 3.0.0b1 fails to serialize `null` literals.
              stringify(null) == "null" &&
              // FF 3.1b1, 2 halts serialization if an array contains a function:
              // `[1, true, getClass, 1]` serializes as "[1,true,],". These versions
              // of Firefox also allow trailing commas in JSON objects and arrays.
              // FF 3.1b3 elides non-JSON values from objects and arrays, unless they
              // define custom `toJSON` methods.
              stringify([undef, getClass, null]) == "[null,null,null]" &&
              // Simple serialization test. FF 3.1b1 uses Unicode escape sequences
              // where character escape codes are expected (e.g., `\b` => `\u0008`).
              stringify({ "a": [value, true, false, null, "\x00\b\n\f\r\t"] }) == serialized &&
              // FF 3.1b1 and b2 ignore the `filter` and `width` arguments.
              stringify(null, value) === "1" &&
              stringify([1, 2], null, 1) == "[\n 1,\n 2\n]" &&
              // JSON 2, Prototype <= 1.7, and older WebKit builds incorrectly
              // serialize extended years.
              stringify(new Date(-8.64e15)) == '"-271821-04-20T00:00:00.000Z"' &&
              // The milliseconds are optional in ES 5, but required in 5.1.
              stringify(new Date(8.64e15)) == '"+275760-09-13T00:00:00.000Z"' &&
              // Firefox <= 11.0 incorrectly serializes years prior to 0 as negative
              // four-digit years instead of six-digit years. Credits: @Yaffle.
              stringify(new Date(-621987552e5)) == '"-000001-01-01T00:00:00.000Z"' &&
              // Safari <= 5.1.5 and Opera >= 10.53 incorrectly serialize millisecond
              // values less than 1000. Credits: @Yaffle.
              stringify(new Date(-1)) == '"1969-12-31T23:59:59.999Z"';
          } catch (exception) {
            stringifySupported = false;
          }
        }
        if (!isAll) {
          return stringifySupported;
        }
      }
      // Test `JSON.parse`.
      if (name == "json-parse" || isAll) {
        var parse = JSON3.parse;
        if (typeof parse == "function") {
          try {
            // FF 3.1b1, b2 will throw an exception if a bare literal is provided.
            // Conforming implementations should also coerce the initial argument to
            // a string prior to parsing.
            if (parse("0") === 0 && !parse(false)) {
              // Simple parsing test.
              value = parse(serialized);
              var parseSupported = value["a"].length == 5 && value["a"][0] === 1;
              if (parseSupported) {
                try {
                  // Safari <= 5.1.2 and FF 3.1b1 allow unescaped tabs in strings.
                  parseSupported = !parse('"\t"');
                } catch (exception) {}
                if (parseSupported) {
                  try {
                    // FF 4.0 and 4.0.1 allow leading `+` signs, and leading and
                    // trailing decimal points. FF 4.0, 4.0.1, and IE 9-10 also
                    // allow certain octal literals.
                    parseSupported = parse("01") !== 1;
                  } catch (exception) {}
                }
              }
            }
          } catch (exception) {
            parseSupported = false;
          }
        }
        if (!isAll) {
          return parseSupported;
        }
      }
      return stringifySupported && parseSupported;
    }
  }

  if (!has("json")) {
    // Common `[[Class]]` name aliases.
    var functionClass = "[object Function]";
    var dateClass = "[object Date]";
    var numberClass = "[object Number]";
    var stringClass = "[object String]";
    var arrayClass = "[object Array]";
    var booleanClass = "[object Boolean]";

    // Detect incomplete support for accessing string characters by index.
    var charIndexBuggy = has("bug-string-char-index");

    // Define additional utility methods if the `Date` methods are buggy.
    if (!isExtended) {
      var floor = Math.floor;
      // A mapping between the months of the year and the number of days between
      // January 1st and the first of the respective month.
      var Months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      // Internal: Calculates the number of days between the Unix epoch and the
      // first day of the given month.
      var getDay = function (year, month) {
        return Months[month] + 365 * (year - 1970) + floor((year - 1969 + (month = +(month > 1))) / 4) - floor((year - 1901 + month) / 100) + floor((year - 1601 + month) / 400);
      };
    }

    // Internal: Determines if a property is a direct property of the given
    // object. Delegates to the native `Object#hasOwnProperty` method.
    if (!(isProperty = {}.hasOwnProperty)) {
      isProperty = function (property) {
        var members = {}, constructor;
        if ((members.__proto__ = null, members.__proto__ = {
          // The *proto* property cannot be set multiple times in recent
          // versions of Firefox and SeaMonkey.
          "toString": 1
        }, members).toString != getClass) {
          // Safari <= 2.0.3 doesn't implement `Object#hasOwnProperty`, but
          // supports the mutable *proto* property.
          isProperty = function (property) {
            // Capture and break the object's prototype chain (see section 8.6.2
            // of the ES 5.1 spec). The parenthesized expression prevents an
            // unsafe transformation by the Closure Compiler.
            var original = this.__proto__, result = property in (this.__proto__ = null, this);
            // Restore the original prototype chain.
            this.__proto__ = original;
            return result;
          };
        } else {
          // Capture a reference to the top-level `Object` constructor.
          constructor = members.constructor;
          // Use the `constructor` property to simulate `Object#hasOwnProperty` in
          // other environments.
          isProperty = function (property) {
            var parent = (this.constructor || constructor).prototype;
            return property in this && !(property in parent && this[property] === parent[property]);
          };
        }
        members = null;
        return isProperty.call(this, property);
      };
    }

    // Internal: A set of primitive types used by `isHostType`.
    var PrimitiveTypes = {
      'boolean': 1,
      'number': 1,
      'string': 1,
      'undefined': 1
    };

    // Internal: Determines if the given object `property` value is a
    // non-primitive.
    var isHostType = function (object, property) {
      var type = typeof object[property];
      return type == 'object' ? !!object[property] : !PrimitiveTypes[type];
    };

    // Internal: Normalizes the `for...in` iteration algorithm across
    // environments. Each enumerated key is yielded to a `callback` function.
    forEach = function (object, callback) {
      var size = 0, Properties, members, property, forEach;

      // Tests for bugs in the current environment's `for...in` algorithm. The
      // `valueOf` property inherits the non-enumerable flag from
      // `Object.prototype` in older versions of IE, Netscape, and Mozilla.
      (Properties = function () {
        this.valueOf = 0;
      }).prototype.valueOf = 0;

      // Iterate over a new instance of the `Properties` class.
      members = new Properties();
      for (property in members) {
        // Ignore all properties inherited from `Object.prototype`.
        if (isProperty.call(members, property)) {
          size++;
        }
      }
      Properties = members = null;

      // Normalize the iteration algorithm.
      if (!size) {
        // A list of non-enumerable properties inherited from `Object.prototype`.
        members = ["valueOf", "toString", "toLocaleString", "propertyIsEnumerable", "isPrototypeOf", "hasOwnProperty", "constructor"];
        // IE <= 8, Mozilla 1.0, and Netscape 6.2 ignore shadowed non-enumerable
        // properties.
        forEach = function (object, callback) {
          var isFunction = getClass.call(object) == functionClass, property, length;
          var hasProperty = !isFunction && typeof object.constructor != 'function' && isHostType(object, 'hasOwnProperty') ? object.hasOwnProperty : isProperty;
          for (property in object) {
            // Gecko <= 1.0 enumerates the `prototype` property of functions under
            // certain conditions; IE does not.
            if (!(isFunction && property == "prototype") && hasProperty.call(object, property)) {
              callback(property);
            }
          }
          // Manually invoke the callback for each non-enumerable property.
          for (length = members.length; property = members[--length]; hasProperty.call(object, property) && callback(property));
        };
      } else if (size == 2) {
        // Safari <= 2.0.4 enumerates shadowed properties twice.
        forEach = function (object, callback) {
          // Create a set of iterated properties.
          var members = {}, isFunction = getClass.call(object) == functionClass, property;
          for (property in object) {
            // Store each property name to prevent double enumeration. The
            // `prototype` property of functions is not enumerated due to cross-
            // environment inconsistencies.
            if (!(isFunction && property == "prototype") && !isProperty.call(members, property) && (members[property] = 1) && isProperty.call(object, property)) {
              callback(property);
            }
          }
        };
      } else {
        // No bugs detected; use the standard `for...in` algorithm.
        forEach = function (object, callback) {
          var isFunction = getClass.call(object) == functionClass, property, isConstructor;
          for (property in object) {
            if (!(isFunction && property == "prototype") && isProperty.call(object, property) && !(isConstructor = property === "constructor")) {
              callback(property);
            }
          }
          // Manually invoke the callback for the `constructor` property due to
          // cross-environment inconsistencies.
          if (isConstructor || isProperty.call(object, (property = "constructor"))) {
            callback(property);
          }
        };
      }
      return forEach(object, callback);
    };

    // Public: Serializes a JavaScript `value` as a JSON string. The optional
    // `filter` argument may specify either a function that alters how object and
    // array members are serialized, or an array of strings and numbers that
    // indicates which properties should be serialized. The optional `width`
    // argument may be either a string or number that specifies the indentation
    // level of the output.
    if (!has("json-stringify")) {
      // Internal: A map of control characters and their escaped equivalents.
      var Escapes = {
        92: "\\\\",
        34: '\\"',
        8: "\\b",
        12: "\\f",
        10: "\\n",
        13: "\\r",
        9: "\\t"
      };

      // Internal: Converts `value` into a zero-padded string such that its
      // length is at least equal to `width`. The `width` must be <= 6.
      var leadingZeroes = "000000";
      var toPaddedString = function (width, value) {
        // The `|| 0` expression is necessary to work around a bug in
        // Opera <= 7.54u2 where `0 == -0`, but `String(-0) !== "0"`.
        return (leadingZeroes + (value || 0)).slice(-width);
      };

      // Internal: Double-quotes a string `value`, replacing all ASCII control
      // characters (characters with code unit values between 0 and 31) with
      // their escaped equivalents. This is an implementation of the
      // `Quote(value)` operation defined in ES 5.1 section 15.12.3.
      var unicodePrefix = "\\u00";
      var quote = function (value) {
        var result = '"', index = 0, length = value.length, isLarge = length > 10 && charIndexBuggy, symbols;
        if (isLarge) {
          symbols = value.split("");
        }
        for (; index < length; index++) {
          var charCode = value.charCodeAt(index);
          // If the character is a control character, append its Unicode or
          // shorthand escape sequence; otherwise, append the character as-is.
          switch (charCode) {
            case 8: case 9: case 10: case 12: case 13: case 34: case 92:
              result += Escapes[charCode];
              break;
            default:
              if (charCode < 32) {
                result += unicodePrefix + toPaddedString(2, charCode.toString(16));
                break;
              }
              result += isLarge ? symbols[index] : charIndexBuggy ? value.charAt(index) : value[index];
          }
        }
        return result + '"';
      };

      // Internal: Recursively serializes an object. Implements the
      // `Str(key, holder)`, `JO(value)`, and `JA(value)` operations.
      var serialize = function (property, object, callback, properties, whitespace, indentation, stack) {
        var value = object[property], className, year, month, date, time, hours, minutes, seconds, milliseconds, results, element, index, length, prefix, hasMembers, result;
        try {
          // Necessary for host object support.
          value = object[property];
        } catch (exception) {}
        if (typeof value == "object" && value) {
          className = getClass.call(value);
          if (className == dateClass && !isProperty.call(value, "toJSON")) {
            if (value > -1 / 0 && value < 1 / 0) {
              // Dates are serialized according to the `Date#toJSON` method
              // specified in ES 5.1 section 15.9.5.44. See section 15.9.1.15
              // for the ISO 8601 date time string format.
              if (getDay) {
                // Manually compute the year, month, date, hours, minutes,
                // seconds, and milliseconds if the `getUTC*` methods are
                // buggy. Adapted from @Yaffle's `date-shim` project.
                date = floor(value / 864e5);
                for (year = floor(date / 365.2425) + 1970 - 1; getDay(year + 1, 0) <= date; year++);
                for (month = floor((date - getDay(year, 0)) / 30.42); getDay(year, month + 1) <= date; month++);
                date = 1 + date - getDay(year, month);
                // The `time` value specifies the time within the day (see ES
                // 5.1 section 15.9.1.2). The formula `(A % B + B) % B` is used
                // to compute `A modulo B`, as the `%` operator does not
                // correspond to the `modulo` operation for negative numbers.
                time = (value % 864e5 + 864e5) % 864e5;
                // The hours, minutes, seconds, and milliseconds are obtained by
                // decomposing the time within the day. See section 15.9.1.10.
                hours = floor(time / 36e5) % 24;
                minutes = floor(time / 6e4) % 60;
                seconds = floor(time / 1e3) % 60;
                milliseconds = time % 1e3;
              } else {
                year = value.getUTCFullYear();
                month = value.getUTCMonth();
                date = value.getUTCDate();
                hours = value.getUTCHours();
                minutes = value.getUTCMinutes();
                seconds = value.getUTCSeconds();
                milliseconds = value.getUTCMilliseconds();
              }
              // Serialize extended years correctly.
              value = (year <= 0 || year >= 1e4 ? (year < 0 ? "-" : "+") + toPaddedString(6, year < 0 ? -year : year) : toPaddedString(4, year)) +
                "-" + toPaddedString(2, month + 1) + "-" + toPaddedString(2, date) +
                // Months, dates, hours, minutes, and seconds should have two
                // digits; milliseconds should have three.
                "T" + toPaddedString(2, hours) + ":" + toPaddedString(2, minutes) + ":" + toPaddedString(2, seconds) +
                // Milliseconds are optional in ES 5.0, but required in 5.1.
                "." + toPaddedString(3, milliseconds) + "Z";
            } else {
              value = null;
            }
          } else if (typeof value.toJSON == "function" && ((className != numberClass && className != stringClass && className != arrayClass) || isProperty.call(value, "toJSON"))) {
            // Prototype <= 1.6.1 adds non-standard `toJSON` methods to the
            // `Number`, `String`, `Date`, and `Array` prototypes. JSON 3
            // ignores all `toJSON` methods on these objects unless they are
            // defined directly on an instance.
            value = value.toJSON(property);
          }
        }
        if (callback) {
          // If a replacement function was provided, call it to obtain the value
          // for serialization.
          value = callback.call(object, property, value);
        }
        if (value === null) {
          return "null";
        }
        className = getClass.call(value);
        if (className == booleanClass) {
          // Booleans are represented literally.
          return "" + value;
        } else if (className == numberClass) {
          // JSON numbers must be finite. `Infinity` and `NaN` are serialized as
          // `"null"`.
          return value > -1 / 0 && value < 1 / 0 ? "" + value : "null";
        } else if (className == stringClass) {
          // Strings are double-quoted and escaped.
          return quote("" + value);
        }
        // Recursively serialize objects and arrays.
        if (typeof value == "object") {
          // Check for cyclic structures. This is a linear search; performance
          // is inversely proportional to the number of unique nested objects.
          for (length = stack.length; length--;) {
            if (stack[length] === value) {
              // Cyclic structures cannot be serialized by `JSON.stringify`.
              throw TypeError();
            }
          }
          // Add the object to the stack of traversed objects.
          stack.push(value);
          results = [];
          // Save the current indentation level and indent one additional level.
          prefix = indentation;
          indentation += whitespace;
          if (className == arrayClass) {
            // Recursively serialize array elements.
            for (index = 0, length = value.length; index < length; hasMembers || (hasMembers = true), index++) {
              element = serialize(index, value, callback, properties, whitespace, indentation, stack);
              results.push(element === undef ? "null" : element);
            }
            result = hasMembers ? (whitespace ? "[\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "]" : ("[" + results.join(",") + "]")) : "[]";
          } else {
            // Recursively serialize object members. Members are selected from
            // either a user-specified list of property names, or the object
            // itself.
            forEach(properties || value, function (property) {
              var element = serialize(property, value, callback, properties, whitespace, indentation, stack);
              if (element !== undef) {
                // According to ES 5.1 section 15.12.3: "If `gap` {whitespace}
                // is not the empty string, let `member` {quote(property) + ":"}
                // be the concatenation of `member` and the `space` character."
                // The "`space` character" refers to the literal space
                // character, not the `space` {width} argument provided to
                // `JSON.stringify`.
                results.push(quote(property) + ":" + (whitespace ? " " : "") + element);
              }
              hasMembers || (hasMembers = true);
            });
            result = hasMembers ? (whitespace ? "{\n" + indentation + results.join(",\n" + indentation) + "\n" + prefix + "}" : ("{" + results.join(",") + "}")) : "{}";
          }
          // Remove the object from the traversed object stack.
          stack.pop();
          return result;
        }
      };

      // Public: `JSON.stringify`. See ES 5.1 section 15.12.3.
      JSON3.stringify = function (source, filter, width) {
        var whitespace, callback, properties;
        if (typeof filter == "function" || typeof filter == "object" && filter) {
          if (getClass.call(filter) == functionClass) {
            callback = filter;
          } else if (getClass.call(filter) == arrayClass) {
            // Convert the property names array into a makeshift set.
            properties = {};
            for (var index = 0, length = filter.length, value; index < length; value = filter[index++], ((getClass.call(value) == stringClass || getClass.call(value) == numberClass) && (properties[value] = 1)));
          }
        }
        if (width) {
          if (getClass.call(width) == numberClass) {
            // Convert the `width` to an integer and create a string containing
            // `width` number of space characters.
            if ((width -= width % 1) > 0) {
              for (whitespace = "", width > 10 && (width = 10); whitespace.length < width; whitespace += " ");
            }
          } else if (getClass.call(width) == stringClass) {
            whitespace = width.length <= 10 ? width : width.slice(0, 10);
          }
        }
        // Opera <= 7.54u2 discards the values associated with empty string keys
        // (`""`) only if they are used directly within an object member list
        // (e.g., `!("" in { "": 1})`).
        return serialize("", (value = {}, value[""] = source, value), callback, properties, whitespace, "", []);
      };
    }

    // Public: Parses a JSON source string.
    if (!has("json-parse")) {
      var fromCharCode = String.fromCharCode;

      // Internal: A map of escaped control characters and their unescaped
      // equivalents.
      var Unescapes = {
        92: "\\",
        34: '"',
        47: "/",
        98: "\b",
        116: "\t",
        110: "\n",
        102: "\f",
        114: "\r"
      };

      // Internal: Stores the parser state.
      var Index, Source;

      // Internal: Resets the parser state and throws a `SyntaxError`.
      var abort = function() {
        Index = Source = null;
        throw SyntaxError();
      };

      // Internal: Returns the next token, or `"$"` if the parser has reached
      // the end of the source string. A token may be a string, number, `null`
      // literal, or Boolean literal.
      var lex = function () {
        var source = Source, length = source.length, value, begin, position, isSigned, charCode;
        while (Index < length) {
          charCode = source.charCodeAt(Index);
          switch (charCode) {
            case 9: case 10: case 13: case 32:
              // Skip whitespace tokens, including tabs, carriage returns, line
              // feeds, and space characters.
              Index++;
              break;
            case 123: case 125: case 91: case 93: case 58: case 44:
              // Parse a punctuator token (`{`, `}`, `[`, `]`, `:`, or `,`) at
              // the current position.
              value = charIndexBuggy ? source.charAt(Index) : source[Index];
              Index++;
              return value;
            case 34:
              // `"` delimits a JSON string; advance to the next character and
              // begin parsing the string. String tokens are prefixed with the
              // sentinel `@` character to distinguish them from punctuators and
              // end-of-string tokens.
              for (value = "@", Index++; Index < length;) {
                charCode = source.charCodeAt(Index);
                if (charCode < 32) {
                  // Unescaped ASCII control characters (those with a code unit
                  // less than the space character) are not permitted.
                  abort();
                } else if (charCode == 92) {
                  // A reverse solidus (`\`) marks the beginning of an escaped
                  // control character (including `"`, `\`, and `/`) or Unicode
                  // escape sequence.
                  charCode = source.charCodeAt(++Index);
                  switch (charCode) {
                    case 92: case 34: case 47: case 98: case 116: case 110: case 102: case 114:
                      // Revive escaped control characters.
                      value += Unescapes[charCode];
                      Index++;
                      break;
                    case 117:
                      // `\u` marks the beginning of a Unicode escape sequence.
                      // Advance to the first character and validate the
                      // four-digit code point.
                      begin = ++Index;
                      for (position = Index + 4; Index < position; Index++) {
                        charCode = source.charCodeAt(Index);
                        // A valid sequence comprises four hexdigits (case-
                        // insensitive) that form a single hexadecimal value.
                        if (!(charCode >= 48 && charCode <= 57 || charCode >= 97 && charCode <= 102 || charCode >= 65 && charCode <= 70)) {
                          // Invalid Unicode escape sequence.
                          abort();
                        }
                      }
                      // Revive the escaped character.
                      value += fromCharCode("0x" + source.slice(begin, Index));
                      break;
                    default:
                      // Invalid escape sequence.
                      abort();
                  }
                } else {
                  if (charCode == 34) {
                    // An unescaped double-quote character marks the end of the
                    // string.
                    break;
                  }
                  charCode = source.charCodeAt(Index);
                  begin = Index;
                  // Optimize for the common case where a string is valid.
                  while (charCode >= 32 && charCode != 92 && charCode != 34) {
                    charCode = source.charCodeAt(++Index);
                  }
                  // Append the string as-is.
                  value += source.slice(begin, Index);
                }
              }
              if (source.charCodeAt(Index) == 34) {
                // Advance to the next character and return the revived string.
                Index++;
                return value;
              }
              // Unterminated string.
              abort();
            default:
              // Parse numbers and literals.
              begin = Index;
              // Advance past the negative sign, if one is specified.
              if (charCode == 45) {
                isSigned = true;
                charCode = source.charCodeAt(++Index);
              }
              // Parse an integer or floating-point value.
              if (charCode >= 48 && charCode <= 57) {
                // Leading zeroes are interpreted as octal literals.
                if (charCode == 48 && ((charCode = source.charCodeAt(Index + 1)), charCode >= 48 && charCode <= 57)) {
                  // Illegal octal literal.
                  abort();
                }
                isSigned = false;
                // Parse the integer component.
                for (; Index < length && ((charCode = source.charCodeAt(Index)), charCode >= 48 && charCode <= 57); Index++);
                // Floats cannot contain a leading decimal point; however, this
                // case is already accounted for by the parser.
                if (source.charCodeAt(Index) == 46) {
                  position = ++Index;
                  // Parse the decimal component.
                  for (; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57); position++);
                  if (position == Index) {
                    // Illegal trailing decimal.
                    abort();
                  }
                  Index = position;
                }
                // Parse exponents. The `e` denoting the exponent is
                // case-insensitive.
                charCode = source.charCodeAt(Index);
                if (charCode == 101 || charCode == 69) {
                  charCode = source.charCodeAt(++Index);
                  // Skip past the sign following the exponent, if one is
                  // specified.
                  if (charCode == 43 || charCode == 45) {
                    Index++;
                  }
                  // Parse the exponential component.
                  for (position = Index; position < length && ((charCode = source.charCodeAt(position)), charCode >= 48 && charCode <= 57); position++);
                  if (position == Index) {
                    // Illegal empty exponent.
                    abort();
                  }
                  Index = position;
                }
                // Coerce the parsed value to a JavaScript number.
                return +source.slice(begin, Index);
              }
              // A negative sign may only precede numbers.
              if (isSigned) {
                abort();
              }
              // `true`, `false`, and `null` literals.
              if (source.slice(Index, Index + 4) == "true") {
                Index += 4;
                return true;
              } else if (source.slice(Index, Index + 5) == "false") {
                Index += 5;
                return false;
              } else if (source.slice(Index, Index + 4) == "null") {
                Index += 4;
                return null;
              }
              // Unrecognized token.
              abort();
          }
        }
        // Return the sentinel `$` character if the parser has reached the end
        // of the source string.
        return "$";
      };

      // Internal: Parses a JSON `value` token.
      var get = function (value) {
        var results, hasMembers;
        if (value == "$") {
          // Unexpected end of input.
          abort();
        }
        if (typeof value == "string") {
          if ((charIndexBuggy ? value.charAt(0) : value[0]) == "@") {
            // Remove the sentinel `@` character.
            return value.slice(1);
          }
          // Parse object and array literals.
          if (value == "[") {
            // Parses a JSON array, returning a new JavaScript array.
            results = [];
            for (;; hasMembers || (hasMembers = true)) {
              value = lex();
              // A closing square bracket marks the end of the array literal.
              if (value == "]") {
                break;
              }
              // If the array literal contains elements, the current token
              // should be a comma separating the previous element from the
              // next.
              if (hasMembers) {
                if (value == ",") {
                  value = lex();
                  if (value == "]") {
                    // Unexpected trailing `,` in array literal.
                    abort();
                  }
                } else {
                  // A `,` must separate each array element.
                  abort();
                }
              }
              // Elisions and leading commas are not permitted.
              if (value == ",") {
                abort();
              }
              results.push(get(value));
            }
            return results;
          } else if (value == "{") {
            // Parses a JSON object, returning a new JavaScript object.
            results = {};
            for (;; hasMembers || (hasMembers = true)) {
              value = lex();
              // A closing curly brace marks the end of the object literal.
              if (value == "}") {
                break;
              }
              // If the object literal contains members, the current token
              // should be a comma separator.
              if (hasMembers) {
                if (value == ",") {
                  value = lex();
                  if (value == "}") {
                    // Unexpected trailing `,` in object literal.
                    abort();
                  }
                } else {
                  // A `,` must separate each object member.
                  abort();
                }
              }
              // Leading commas are not permitted, object property names must be
              // double-quoted strings, and a `:` must separate each property
              // name and value.
              if (value == "," || typeof value != "string" || (charIndexBuggy ? value.charAt(0) : value[0]) != "@" || lex() != ":") {
                abort();
              }
              results[value.slice(1)] = get(lex());
            }
            return results;
          }
          // Unexpected token encountered.
          abort();
        }
        return value;
      };

      // Internal: Updates a traversed object member.
      var update = function(source, property, callback) {
        var element = walk(source, property, callback);
        if (element === undef) {
          delete source[property];
        } else {
          source[property] = element;
        }
      };

      // Internal: Recursively traverses a parsed JSON object, invoking the
      // `callback` function for each value. This is an implementation of the
      // `Walk(holder, name)` operation defined in ES 5.1 section 15.12.2.
      var walk = function (source, property, callback) {
        var value = source[property], length;
        if (typeof value == "object" && value) {
          // `forEach` can't be used to traverse an array in Opera <= 8.54
          // because its `Object#hasOwnProperty` implementation returns `false`
          // for array indices (e.g., `![1, 2, 3].hasOwnProperty("0")`).
          if (getClass.call(value) == arrayClass) {
            for (length = value.length; length--;) {
              update(value, length, callback);
            }
          } else {
            forEach(value, function (property) {
              update(value, property, callback);
            });
          }
        }
        return callback.call(source, property, value);
      };

      // Public: `JSON.parse`. See ES 5.1 section 15.12.2.
      JSON3.parse = function (source, callback) {
        var result, value;
        Index = 0;
        Source = "" + source;
        result = get(lex());
        // If a JSON string contains multiple tokens, it is invalid.
        if (lex() != "$") {
          abort();
        }
        // Reset the parser state.
        Index = Source = null;
        return callback && getClass.call(callback) == functionClass ? walk((value = {}, value[""] = result, value), "", callback) : result;
      };
    }
  }

  // Export for asynchronous module loaders.
  if (isLoader) {
    define(function () {
      return JSON3;
    });
  }
}(this));
// End of original code.

// Finally expose (polyfilled) window.JSON as qx.lang.Json.JSON
qx.lang.Json.stringify = window.JSON.stringify;
qx.lang.Json.parse = window.JSON.parse;
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2008 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Sebastian Werner (wpbasti)
     * Andreas Ecker (ecker)
     * Fabian Jakobs (fjakobs)

************************************************************************ */

/**
 * Cross browser XML document creation API
 *
 * The main purpose of this class is to allow you to create XML document objects in a
 * cross-browser fashion. Use <code>create</code> to create an empty document,
 * <code>fromString</code> to create one from an existing XML text. Both methods
 * return a *native DOM object*. That means you use standard DOM methods on such
 * an object (e.g. <code>createElement</code>).
 *
 * The following links provide further information on XML documents:
 *
 * * <a href="http://www.w3.org/TR/DOM-Level-2-Core/core.html#i-Document">W3C Interface Specification</a>
 * * <a href="http://msdn2.microsoft.com/en-us/library/ms535918.aspx">MS xml Object</a>
 * * <a href="http://msdn2.microsoft.com/en-us/library/ms764622.aspx">MSXML GUIDs and ProgIDs</a>
 * * <a href="https://developer.mozilla.org/en-US/docs/Parsing_and_serializing_XML">MDN Parsing and Serializing XML</a>
 */
qx.Bootstrap.define("qx.xml.Document",
{
  statics :
  {
    /** @type {String} ActiveX class name of DOMDocument (IE specific) */
    DOMDOC : null,

    /** @type {String} ActiveX class name of XMLHttpRequest (IE specific) */
    XMLHTTP : null,


    /**
     * Whether the given element is a XML document or element
     * which is part of a XML document.
     *
     * @param elem {Document|Element} Any DOM Document or Element
     * @return {Boolean} Whether the document is a XML document
     */
    isXmlDocument : function(elem)
    {
      if (elem.nodeType === 9) {
        return elem.documentElement.nodeName !== "HTML";
      } else if (elem.ownerDocument) {
        return this.isXmlDocument(elem.ownerDocument);
      } else {
        return false;
      }
    },


    /**
     * Create an XML document.
     *
     * Returns a native DOM document object, set up for XML.
     *
     * @param namespaceUri {String ? null} The namespace URI of the document element to create or null.
     * @param qualifiedName {String ? null} The qualified name of the document element to be created or null.
     * @return {Document} empty XML object
     */
    create : function(namespaceUri, qualifiedName)
    {
      // ActiveX - This is the preferred way for IE9 as well since it has no XPath
      // support when using the native implementation.createDocument
      if (qx.core.Environment.get("plugin.activex")) {
        var obj = new ActiveXObject(this.DOMDOC);
        //The SelectionLanguage property is no longer needed in MSXML 6; trying
        // to set it causes an exception in IE9.
        if (this.DOMDOC == "MSXML2.DOMDocument.3.0") {
          obj.setProperty("SelectionLanguage", "XPath");
        }

        if (qualifiedName)
        {
          var str = '<\?xml version="1.0" encoding="utf-8"?>\n<';

          str += qualifiedName;

          if (namespaceUri) {
            str += " xmlns='" + namespaceUri + "'";
          }

          str += " />";
          obj.loadXML(str);
        }

        return obj;
      }

      if (qx.core.Environment.get("xml.implementation")) {
        return document.implementation.createDocument(namespaceUri || "", qualifiedName || "", null);
      }

      throw new Error("No XML implementation available!");
    },


    /**
     * The string passed in is parsed into a DOM document.
     *
     * @param str {String} the string to be parsed
     * @return {Document} XML document with given content
     * @signature function(str)
     */
    fromString : function(str)
    {
      // Legacy IE/ActiveX
      if (qx.core.Environment.get("plugin.activex")) {
        var dom = qx.xml.Document.create();
        dom.loadXML(str);
        return dom;
      }

      if (qx.core.Environment.get("xml.domparser")) {
        var parser = new DOMParser();
        return parser.parseFromString(str, "text/xml");
      }

      throw new Error("No XML implementation available!");
    }
  },




  /*
  *****************************************************************************
     DEFER
  *****************************************************************************
  */

  defer : function(statics)
  {
    // Detecting available ActiveX implementations.
    if (qx.core.Environment.get("plugin.activex"))
    {
      // According to information on the Microsoft XML Team's WebLog
      // it is recommended to check for availability of MSXML versions 6.0 and 3.0.
      // http://blogs.msdn.com/xmlteam/archive/2006/10/23/using-the-right-version-of-msxml-in-internet-explorer.aspx
      var domDoc = [ "MSXML2.DOMDocument.6.0", "MSXML2.DOMDocument.3.0" ];
      var httpReq = [ "MSXML2.XMLHTTP.6.0", "MSXML2.XMLHTTP.3.0" ];

      for (var i=0, l=domDoc.length; i<l; i++)
      {
        try
        {
          // Keep both objects in sync with the same version.
          // This is important as there were compatibility issues detected.
          new ActiveXObject(domDoc[i]);
          new ActiveXObject(httpReq[i]);
        }
        catch(ex) {
          continue;
        }

        // Update static constants
        statics.DOMDOC = domDoc[i];
        statics.XMLHTTP = httpReq[i];

        // Stop loop here
        break;
      }
    }
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Daniel Wagner (d_wagner)

************************************************************************ */
/**
 * Internal class which contains the checks used by {@link qx.core.Environment}.
 * All checks in here are marked as internal which means you should never use
 * them directly.
 *
 * This class should contain all XML-related checks
 *
 * @internal
 */
qx.Bootstrap.define("qx.bom.client.Xml",
{
  statics:
  {
    /**
     * Checks if XML is supported
     *
     * @internal
     * @return {Boolean} <code>true</code> if XML is supported
     */
    getImplementation : function() {
      return document.implementation && document.implementation.hasFeature &&
        document.implementation.hasFeature("XML", "1.0");
    },


    /**
     * Checks if an XML DOMParser is available
     *
     * @internal
     * @return {Boolean} <code>true</code> if DOMParser is supported
     */
    getDomParser : function() {
      return typeof window.DOMParser !== "undefined";
    },


    /**
     * Checks if the proprietary selectSingleNode method is available on XML DOM
     * nodes.
     *
     * @internal
     * @return {Boolean} <code>true</code> if selectSingleNode is available
     */
    getSelectSingleNode : function()
    {
      return typeof qx.xml.Document.create().selectSingleNode !== "undefined";
    },


    /**
     * Checks if the proprietary selectNodes method is available on XML DOM
     * nodes.
     *
     * @internal
     * @return {Boolean} <code>true</code> if selectSingleNode is available
     */
    getSelectNodes : function()
    {
      return typeof qx.xml.Document.create().selectNodes !== "undefined";
    },


    /**
     * Checks availablity of the getElementsByTagNameNS XML DOM method.
     *
     * @internal
     * @return {Boolean} <code>true</code> if getElementsByTagNameNS is available
     */
    getElementsByTagNameNS : function()
    {
      return typeof qx.xml.Document.create().getElementsByTagNameNS !== "undefined";
    },


    /**
     * Checks if MSXML-style DOM Level 2 properties are supported.
     *
     * @internal
     * @return {Boolean} <code>true</code> if DOM Level 2 properties are supported
     */
    getDomProperties : function()
    {
      var doc = qx.xml.Document.create();
      return ("getProperty" in doc && typeof doc.getProperty("SelectionLanguage") === "string");
    },


    /**
     * Checks if the getAttributeNS and setAttributeNS methods are supported on
     * XML DOM elements
     *
     * @internal
     * @return {Boolean} <code>true</code> if get/setAttributeNS is supported
     */
    getAttributeNS : function()
    {
      var docElem = qx.xml.Document.fromString("<a></a>").documentElement;
      return typeof docElem.getAttributeNS === "function" &&
        typeof docElem.setAttributeNS === "function";
    },


    /**
     * Checks if the createElementNS method is supported on XML DOM documents
     *
     * @internal
     * @return {Boolean} <code>true</code> if createElementNS is supported
     */
    getCreateElementNS : function()
    {
      return typeof qx.xml.Document.create().createElementNS === "function";
    },


    /**
     * Checks if the proprietary createNode method is supported on XML DOM
     * documents
     *
     * @internal
     * @return {Boolean} <code>true</code> if DOM Level 2 properties are supported
     */
    getCreateNode : function()
    {
      return typeof qx.xml.Document.create().createNode !== "undefined";
    },


    /**
     * Checks if the proprietary getQualifiedItem method is supported for XML
     * element attributes
     *
     * @internal
     * @return {Boolean} <code>true</code> if DOM Level 2 properties are supported
     */
    getQualifiedItem : function()
    {
      var docElem = qx.xml.Document.fromString("<a></a>").documentElement;
      return typeof docElem.attributes.getQualifiedItem !== "undefined";
    }
  },

  defer : function(statics)
  {
    qx.core.Environment.add("xml.implementation", statics.getImplementation);
    qx.core.Environment.add("xml.domparser", statics.getDomParser);
    qx.core.Environment.add("xml.selectsinglenode", statics.getSelectSingleNode);
    qx.core.Environment.add("xml.selectnodes", statics.getSelectNodes);
    qx.core.Environment.add("xml.getelementsbytagnamens", statics.getElementsByTagNameNS);
    qx.core.Environment.add("xml.domproperties", statics.getDomProperties);
    qx.core.Environment.add("xml.attributens", statics.getAttributeNS);
    qx.core.Environment.add("xml.createelementns", statics.getCreateElementNS);
    qx.core.Environment.add("xml.createnode", statics.getCreateNode);
    qx.core.Environment.add("xml.getqualifieditem", statics.getQualifiedItem);
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2013 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Richard Sternagel (rsternagel)

************************************************************************ */

/**
 * This class is internal because it's tailored to {@link qx.io.rest.Resource}
 * which needs more functionality than {@link qx.bom.request.Xhr} provides.
 * The usage of {@link qx.io.request.Xhr} isn't possible either due to it's qx.Class nature.
 *
 * For alternatives to this class have a look at:
 *
 * * "qx.bom.request.Xhr" (low level, cross-browser XHR abstraction compatible with spec)
 * * "qx.io.request.Xhr" (high level XHR abstraction)
 *
 * A wrapper of {@link qx.bom.request.Xhr} which offers:
 *
 * * set/get HTTP method, URL, request data and headers
 * * retrieve the parsed response as object (content-type recognition)
 * * more fine-grained events such as success, fail, ...
 * * supports hash code for request identification
 *
 * It does *not* comply the interface defined by {@link qx.bom.request.IRequest}.
 *
 * <div class="desktop">
 * Example:
 *
 * <pre class="javascript">
 *  var req = new qx.bom.request.SimpleXhr("/some/path/file.json");
 *  req.setRequestData({"a":"b"});
 *  req.once("success", function successHandler() {
 *    var response = req.getResponse();
 *  }, this);
 *  req.once("fail", function successHandler() {
 *    var response = req.getResponse();
 *  }, this);
 *  req.send();
 * </pre>
 * </div>
 *
 * @internal
 */
qx.Bootstrap.define("qx.bom.request.SimpleXhr",
{

  extend: Object,

  /**
   * @param url {String?} The URL of the resource to request.
   * @param method {String?"GET"} The HTTP method.
   */
  construct: function(url, method) {
    if (url !== undefined) {
      this.setUrl(url);
    }

    this.useCaching(true);
    this.setMethod((method !== undefined) ? method : "GET");
    this._transport = this._registerTransportListener(this._createTransport());

    qx.core.ObjectRegistry.register(this);

    this.__requestHeaders = {};
    this.__parser = this._createResponseParser();
  },

  members :
  {
    /*
    ---------------------------------------------------------------------------
      PUBLIC
    ---------------------------------------------------------------------------
    */

    /**
     * Sets a request header.
     *
     * @param key {String} Key of the header.
     * @param value {String} Value of the header.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    setRequestHeader: function(key, value) {
      this.__requestHeaders[key] = value;
      return this;
    },

    /**
     * Gets a request header.
     *
     * @param key {String} Key of the header.
     * @return {String} The value of the header.
     */
    getRequestHeader: function(key) {
      return this.__requestHeaders[key];
    },

    /**
     * Sets the URL.
     *
     * @param url {String} URL to be requested.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    setUrl: function(url) {
      if (qx.lang.Type.isString(url)) {
        this.__url = url;
      }
      return this;
    },

    /**
     * Gets the URL.
     *
     * @return {String} URL to be requested.
     */
    getUrl: function() {
      return this.__url;
    },

    /**
     * Sets the HTTP-Method.
     *
     * @param method {String} The method.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    setMethod: function(method) {
      if (qx.util.Request.isMethod(method)) {
        this.__method = method;
      }
      return this;
    },

    /**
     * Gets the HTTP-Method.
     *
     * @return {String} The method.
     */
    getMethod: function() {
      return this.__method;
    },

    /**
     * Sets the request data to be send as part of the request.
     *
     * The request data is transparently included as URL query parameters or embedded in the
     * request body as form data.
     *
     * @param data {String|Object} The request data.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    setRequestData: function(data) {
      if (qx.lang.Type.isString(data) || qx.lang.Type.isObject(data)) {
        this.__requestData = data;
      }
      return this;
    },

    /**
     * Gets the request data.
     *
     * @return {String} The request data.
     */
    getRequestData: function() {
      return this.__requestData;
    },

    /**
     * Gets parsed response.
     *
     * If problems occured an empty string ("") is more likely to be returned (instead of null).
     *
     * @return {String|null} The parsed response of the request.
     */
    getResponse: function() {
      if (this.__response !== null) {
        return this.__response;
      } else {
        return (this._transport.responseXML !== null) ? this._transport.responseXML : this._transport.responseText;
      }

      return null;
    },

    /**
     * Gets low-level transport.
     *
     * Note: To be used with caution!
     *
     * This method can be used to query the transport directly,
     * but should be used with caution. Especially, it
     * is not advisable to call any destructive methods
     * such as <code>open</code> or <code>send</code>.
     *
     * @return {Object} An instance of a class found in
     *  <code>qx.bom.request.*</code>
     */
     // This method mainly exists so that some methods found in the
     // low-level transport can be deliberately omitted here,
     // but still be accessed should it be absolutely necessary.
     //
     // Valid use cases include to query the transport’s responseXML
     // property if performance is critical and any extra parsing
     // should be avoided at all costs.
     //
    getTransport: function() {
      return this._transport;
    },

    /**
     * Sets (i.e. override) the parser for the response parsing.
     *
     * @see qx.util.ResponseParser#setParser
     *
     * @param parser {String|Function}
     * @return {Function} The parser function
     */
    setParser: function(parser) {
      return this.__parser.setParser(parser);
    },

    /**
     * Sets the timout limit in milliseconds.
     *
     * @param millis {Number} limit in milliseconds.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    setTimeout: function(millis) {
      if (qx.lang.Type.isNumber(millis)) {
        this.__timeout = millis;
      }
      return this;
    },

    /**
     * The current timeout in milliseconds.
     *
     * @return {Number} The current timeout in milliseconds.
     */
    getTimeout: function() {
      return this.__timeout;
    },

    /**
     * Whether to allow request to be answered from cache.
     *
     * Allowed values:
     *
     * * <code>true</code>: Allow caching (Default)
     * * <code>false</code>: Prohibit caching. Appends 'nocache' parameter to URL.
     *
     * Consider setting a Cache-Control header instead. A request’s Cache-Control
     * header may contain a number of directives controlling the behavior of
     * any caches in between client and origin server and allows therefore a more
     * fine grained control over caching. If such a header is provided, the setting
     * of setCache() will be ignored.
     *
     * * <code>"no-cache"</code>: Force caches to submit request in order to
     * validate the freshness of the representation. Note that the requested
     * resource may still be served from cache if the representation is
     * considered fresh. Use this directive to ensure freshness but save
     * bandwidth when possible.
     * * <code>"no-store"</code>: Do not keep a copy of the representation under
     * any conditions.
     *
     * See <a href="http://www.mnot.net/cache_docs/#CACHE-CONTROL">
     * Caching tutorial</a> for an excellent introduction to Caching in general.
     * Refer to the corresponding section in the
     * <a href="http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.9">
     * HTTP 1.1 specification</a> for more details and advanced directives.
     *
     * It is recommended to choose an appropriate Cache-Control directive rather
     * than prohibit caching using the nocache parameter.
     *
     * @param value {Boolean}
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    useCaching: function(value) {
      if (qx.lang.Type.isBoolean(value)) {
        this.__cache = value;
      }
      return this;
    },

    /**
     * Whether requests are cached.
     *
     * @return {Boolean} Whether requests are cached.
     */
    isCaching: function() {
      return this.__cache;
    },

    /**
     * Whether request completed (is done).

     * @return {Boolean} Whether request is completed.
     */
    isDone: function() {
      return (this._transport.readyState === qx.bom.request.Xhr.DONE);
    },

    /**
     * Returns unique hash code of object.
     *
     * @return {Integer} unique hash code of the object
     */
    toHashCode : function() {
      return this.$$hash;
    },

    /**
     * Returns true if the object is disposed.
     *
     * @return {Boolean} Whether the object has been disposed
     */
    isDisposed: function() {
      return !!this.__disposed;
    },

    /**
     * Sends request.
     *
     * Relies on set before:
     * * a HTTP method
     * * an URL
     * * optional request headers
     * * optional request data
     */
    send: function() {
      var curTimeout = this.getTimeout(),
          hasRequestData = (this.getRequestData() !== null),
          hasCacheControlHeader = this.__requestHeaders.hasOwnProperty("Cache-Control"),
          isBodyForMethodAllowed = qx.util.Request.methodAllowsRequestBody(this.getMethod()),
          curContentType = this.getRequestHeader("Content-Type"),
          serializedData = this._serializeData(this.getRequestData(), curContentType);

      // add GET params if needed
      if (this.getMethod() === "GET" && hasRequestData) {
        this.setUrl(qx.util.Uri.appendParamsToUrl(this.getUrl(), serializedData));
      }

      // cache prevention
      if (this.isCaching() === false && !hasCacheControlHeader) {
        // Make sure URL cannot be served from cache and new request is made
        this.setUrl(qx.util.Uri.appendParamsToUrl(this.getUrl(), {nocache: new Date().valueOf()}));
      }

      // set timeout
      if (curTimeout) {
        this._transport.timeout = curTimeout;
      }

      // initialize request
      this._transport.open(this.getMethod(), this.getUrl(), true);

      // set all previously stored headers on initialized request
      for (var key in this.__requestHeaders) {
        this._transport.setRequestHeader(key, this.__requestHeaders[key]);
      }

      // send
      if (!isBodyForMethodAllowed) {
        // GET & HEAD
        this._transport.send();
      } else {
        // POST & PUT ...
        if (typeof curContentType === "undefined") {
          // by default, set content-type urlencoded for requests with body
          this._transport.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        }

        this._transport.send(serializedData);
      }
    },

    /**
     * Aborts request.
     *
     * Cancels any network activity.
     * @return {qx.bom.request.SimpleXhr} Self for chaining.
     */
    abort: function() {
      this._transport.abort();
      return this;
    },

    /**
     * Disposes object and wrapped transport.
     * @return {Boolean} <code>true</code> if the object was successfully disposed
     */
    dispose: function() {
      if (this._transport.dispose()) {
        this.__parser = null;
        this.__disposed = true;
        return true;
      }
      return false;
    },

    /*
    ---------------------------------------------------------------------------
      PROTECTED
    ---------------------------------------------------------------------------
    */

    /**
     * Holds transport.
     */
    _transport: null,

    /**
     * Creates XHR transport.
     *
     * May be overriden to change type of resource.
     * @return {qx.bom.request.IRequest} Transport.
     */
    _createTransport: function() {
      return new qx.bom.request.Xhr();
    },

    /**
     * Registers common listeners on given transport.
     *
     * @param transport {qx.bom.request.IRequest} Transport.
     * @return {qx.bom.request.IRequest} Transport.
     */
    _registerTransportListener: function(transport) {
      transport.onreadystatechange = qx.lang.Function.bind(this._onReadyStateChange, this);
      transport.onloadend = qx.lang.Function.bind(this._onLoadEnd, this);
      transport.ontimeout = qx.lang.Function.bind(this._onTimeout, this);
      transport.onerror = qx.lang.Function.bind(this._onError, this);
      transport.onabort = qx.lang.Function.bind(this._onAbort, this);
      return transport;
    },

    /**
     * Creates response parser.
     *
     * @return {qx.util.ResponseParser} parser.
     */
    _createResponseParser: function() {
        return new qx.util.ResponseParser();
    },

    /**
     * Sets the response.
     *
     * @param response {String} The parsed response of the request.
     */
    _setResponse: function(response) {
      this.__response = response;
    },

    /**
     * Serializes data.
     *
     * @param data {String|Map} Data to serialize.
     * @param contentType {String?} Content-Type which influences the serialisation.
     * @return {String|null} Serialized data.
     */
    _serializeData: function(data, contentType) {
      var isPost = this.getMethod() === "POST",
          isJson = (/application\/.*\+?json/).test(contentType);

      if (!data) {
        return null;
      }

      if (qx.lang.Type.isString(data)) {
        return data;
      }

      if (isJson && (qx.lang.Type.isObject(data) || qx.lang.Type.isArray(data))) {
        return qx.lang.Json.stringify(data);
      }

      if (qx.lang.Type.isObject(data)) {
        return qx.util.Uri.toParameter(data, isPost);
      }

      return null;
    },

    /*
    ---------------------------------------------------------------------------
      PRIVATE
    ---------------------------------------------------------------------------
    */

    /**
     * {Array} Request headers.
     */
    __requestHeaders: null,
    /**
     * {Object} Request data (i.e. body).
     */
    __requestData: null,
    /**
     * {String} HTTP method to use for request.
     */
    __method: "",
    /**
     * {String} Requested URL.
     */
    __url: "",
    /**
     * {Object} Response data.
     */
    __response: null,
    /**
     * {Function} Parser.
     */
    __parser: null,
    /**
     * {Boolean} Whether caching will be enabled.
     */
    __cache: null,
    /**
     * {Number} The current timeout in milliseconds.
     */
    __timeout: null,
    /**
     * {Boolean} Whether object has been disposed.
     */
    __disposed: null,

    /*
    ---------------------------------------------------------------------------
      EVENT HANDLING
    ---------------------------------------------------------------------------
    */

    /**
     * Adds an event listener for the given event name which is executed only once.
     *
     * @param name {String} The name of the event to listen to.
     * @param listener {Function} The function to execute when the event is fired
     * @param ctx {var?} The context of the listener.
     * @return {qx.bom.request.Xhr} Self for chaining.
     */
    addListenerOnce: function(name, listener, ctx) {
      this._transport._emitter.once(name, listener, ctx);
      return this;
    },

    /**
     * Handles "readyStateChange" event.
     */
    _onReadyStateChange: function() {
      if (qx.core.Environment.get("qx.debug.io")) {
        qx.Bootstrap.debug("Fire readyState: " + this._transport.readyState);
      }

      if (this.isDone()) {
        this.__onReadyStateDone();
      }
    },

    /**
     * Called internally when readyState is DONE.
     */
    __onReadyStateDone: function() {
      if (qx.core.Environment.get("qx.debug.io")) {
        qx.Bootstrap.debug("Request completed with HTTP status: " + this._transport.status);
      }

      var response = this._transport.responseText;
      var contentType = this._transport.getResponseHeader("Content-Type");

      // Successful HTTP status
      if (qx.util.Request.isSuccessful(this._transport.status)) {

        // Parse response
        if (qx.core.Environment.get("qx.debug.io")) {
          qx.Bootstrap.debug("Response is of type: '" + contentType + "'");
        }

        this._setResponse(this.__parser.parse(response, contentType));

        this._transport._emit("success");

      // Erroneous HTTP status
      } else {

        try {
          this._setResponse(this.__parser.parse(response, contentType));
        } catch (e) {
          // ignore if it does not work
        }

        // A remote error failure
        if (this._transport.status !== 0) {
          this._transport._emit("fail");
        }
      }
    },

    /**
     * Handles "loadEnd" event.
     */
    _onLoadEnd: function() {
      this._transport._emit("loadEnd");
    },

    /**
     * Handles "abort" event.
     */
    _onAbort: function() {
      this._transport._emit("abort");
    },

    /**
     * Handles "timeout" event.
     */
    _onTimeout: function() {
      this._transport._emit("timeout");

      // A network error failure
      this._transport._emit("fail");
    },

    /**
     * Handles "error" event.
     */
    _onError: function() {
      this._transport._emit("error");

      // A network error failure
      this._transport._emit("fail");
    }

  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2007-2008 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Sebastian Werner (wpbasti)

************************************************************************ */

/**
 * Registration for all instances of qooxdoo classes. Mainly
 * used to manage them for the final shutdown sequence and to
 * use weak references when connecting widgets to DOM nodes etc.
 *
 * @ignore(qx.dev, qx.dev.Debug.*)
 */
qx.Bootstrap.define("qx.core.ObjectRegistry",
{
  /*
  *****************************************************************************
     STATICS
  *****************************************************************************
  */

  statics :
  {
    /** @type {Boolean} Whether the application is in the shutdown phase */
    inShutDown : false,

    /** @type {Map} Internal data structure to store objects */
    __registry : {},

    /** @type {Integer} Next new hash code. */
    __nextHash : 0,

    /** @type {Array} List of all free hash codes */
    __freeHashes : [],

    /** @type {String} Post id for hash code creation. */
    __postId : "",

    /** @type {Map} Object hashes to stack traces (for dispose profiling only) */
    __stackTraces : {},

    /**
     * Registers an object into the database. This adds a hashcode
     * to the object (if not already done before) and stores it under
     * this hashcode. You can access this object later using the hashcode
     * by calling {@link #fromHashCode}.
     *
     * All registered objects are automatically disposed on application
     * shutdown. Each registered object must at least have a method
     * called <code>dispose</code>.
     *
     * @param obj {Object} Any object with a dispose() method
     */
    register : function(obj)
    {
      var registry = this.__registry;
      if (!registry) {
        return;
      }

      var hash = obj.$$hash;
      if (hash == null)
      {
        // Create new hash code
        var cache = this.__freeHashes;
        if (cache.length > 0 && !qx.core.Environment.get("qx.debug.dispose")) {
          hash = cache.pop();
        } else {
          hash = (this.__nextHash++) + this.__postId;
        }

        // Store hash code
        obj.$$hash = hash;

        if (qx.core.Environment.get("qx.debug.dispose")) {
          if (qx.dev && qx.dev.Debug && qx.dev.Debug.disposeProfilingActive) {
            this.__stackTraces[hash] = qx.dev.StackTrace.getStackTrace();
          }
        }
      }

      if (qx.core.Environment.get("qx.debug"))
      {
        if (!obj.dispose) {
          throw new Error("Invalid object: " + obj);
        }
      }

      registry[hash] = obj;
    },


    /**
     * Removes the given object from the database.
     *
     * @param obj {Object} Any previously registered object
     */
    unregister : function(obj)
    {
      var hash = obj.$$hash;
      if (hash == null) {
        return;
      }

      var registry = this.__registry;
      if (registry && registry[hash])
      {
        delete registry[hash];
        this.__freeHashes.push(hash);
      }

      // Delete the hash code
      try
      {
        delete obj.$$hash
      }
      catch(ex)
      {
        // IE has trouble directly removing the hash
        // but it's ok with using removeAttribute
        if (obj.removeAttribute) {
          obj.removeAttribute("$$hash");
        }
      }
    },


    /**
     * Returns an unique identifier for the given object. If such an identifier
     * does not yet exist, create it.
     *
     * @param obj {Object} the object to get the hashcode for
     * @return {String} unique identifier for the given object
     */
    toHashCode : function(obj)
    {
      if (qx.core.Environment.get("qx.debug"))
      {
        if (obj == null) {
          throw new Error("Invalid object: " + obj);
        }
      }

      var hash = obj.$$hash;
      if (hash != null) {
        return hash;
      }

      // Create new hash code
      var cache = this.__freeHashes;
      if (cache.length > 0) {
        hash = cache.pop();
      } else {
        hash = (this.__nextHash++) + this.__postId;
      }

      // Store
      return obj.$$hash = hash;
    },


    /**
     * Clears the unique identifier on the given object.
     *
     * @param obj {Object} the object to clear the hashcode for
     */
    clearHashCode : function(obj)
    {
      if (qx.core.Environment.get("qx.debug"))
      {
        if (obj == null) {
          throw new Error("Invalid object: " + obj);
        }
      }

      var hash = obj.$$hash;
      if (hash != null)
      {
        this.__freeHashes.push(hash);

        // Delete the hash code
        try
        {
          delete obj.$$hash
        }
        catch(ex)
        {
          // IE has trouble directly removing the hash
          // but it's ok with using removeAttribute
          if (obj.removeAttribute) {
            obj.removeAttribute("$$hash");
          }
        }
      }
    },


    /**
     * Get an object instance by its hash code as returned by {@link #toHashCode}.
     * If the object is already disposed or the hashCode is invalid,
     * <code>null</code> is returned.
     *
     * @param hash {String} The object's hash code.
     * @return {qx.core.Object} The corresponding object or <code>null</code>.
     */
    fromHashCode : function(hash) {
      return this.__registry[hash] || null;
    },


    /**
     * Disposing all registered object and cleaning up registry. This is
     * automatically executed at application shutdown.
     *
     */
    shutdown : function()
    {
      this.inShutDown = true;

      var registry = this.__registry;
      var hashes = [];

      for (var hash in registry) {
        hashes.push(hash);
      }

      // sort the objects! Remove the objecs created at startup
      // as late as possible
      hashes.sort(function(a, b) {
        return parseInt(b, 10)-parseInt(a, 10);
      });

      var obj, i=0, l=hashes.length;
      while(true)
      {
        try
        {
          for (; i<l; i++)
          {
            hash = hashes[i];
            obj = registry[hash];

            if (obj && obj.dispose) {
              obj.dispose();
            }
          }
        }
        catch(ex)
        {
          qx.Bootstrap.error(this, "Could not dispose object " + obj.toString() + ": " + ex, ex);

          if (i !== l)
          {
            i++;
            continue;
          }
        }

        break;
      }

      qx.Bootstrap.debug(this, "Disposed " + l + " objects");

      delete this.__registry;
    },


    /**
     * Returns the object registry.
     *
     * @return {Object} The registry
     */
    getRegistry : function() {
      return this.__registry;
    },


    /**
     * Returns the next hash code that will be used
     *
     * @return {Integer} The next hash code
     * @internal
     */
    getNextHash : function() {
      return this.__nextHash;
    },


    /**
     * Returns the postfix that identifies the current iframe
     *
     * @return {Integer} The next hash code
     * @internal
     */
    getPostId : function() {
      return this.__postId;
    },


    /**
     * Returns the map of stack traces recorded when objects are registered
     * (for dispose profiling)
     * @return {Map} Map: object hash codes to stack traces
     * @internal
     */
    getStackTraces : function() {
      return this.__stackTraces;
    }
  },

  defer : function(statics)
  {
    if (window && window.top)
    {
      var frames = window.top.frames;
      for (var i = 0; i < frames.length; i++)
      {
        if (frames[i] === window)
        {
          statics.__postId = "-" + (i + 1);
          return;
        }
      }
    }
    statics.__postId = "-0";
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Tristan Koch (tristankoch)
     * Richard Sternagel (rsternagel)

************************************************************************ */

/**
 * Static helpers for handling HTTP requests.
 */
qx.Bootstrap.define("qx.util.Request",
{
  statics:
  {
    /**
     * Whether URL given points to resource that is cross-domain,
     * i.e. not of same origin.
     *
     * @param url {String} URL.
     * @return {Boolean} Whether URL is cross domain.
     */
    isCrossDomain: function(url) {
      var result = qx.util.Uri.parseUri(url),
          location = window.location;

      if (!location) {
        return false;
      }

      var protocol = location.protocol;

      // URL is relative in the sence that it points to origin host
      if (!(url.indexOf("//") !== -1)) {
        return false;
      }

      if (protocol.substr(0, protocol.length-1) == result.protocol &&
          location.host === result.host &&
          location.port === result.port) {
        return false;
      }

      return true;
    },

    /**
     * Determine if given HTTP status is considered successful.
     *
     * @param status {Number} HTTP status.
     * @return {Boolean} Whether status is considered successful.
     */
    isSuccessful: function(status) {
      return (status >= 200 && status < 300 || status === 304);
    },

    /**
     * Determine if given HTTP method is valid.
     *
     * @param method {String} HTTP method.
     * @return {Boolean} Whether method is a valid HTTP method.
     */
    isMethod: function(method) {
      var knownMethods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "TRACE", "CONNECT", "PATCH"];
      return (knownMethods.indexOf(method) !== -1) ? true : false;
    },

    /**
     * Request body is ignored for HTTP method GET and HEAD.
     *
     * See http://www.w3.org/TR/XMLHttpRequest2/#the-send-method.
     *
     * @param method {String} The HTTP method.
     * @return {Boolean} Whether request may contain body.
     */
    methodAllowsRequestBody: function(method) {
      return !((/^(GET|HEAD)$/).test(method));
    }
  }
});
/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2013 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     LGPL: http://www.gnu.org/licenses/lgpl.html
     EPL: http://www.eclipse.org/org/documents/epl-v10.php
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Richard Sternagel (rsternagel)

************************************************************************ */

/**
 * Parsers for parsing response strings (especially for XHR).
 *
 * Known parsers are: <code>"json"</code> and <code>"xml"</code>.
 *
 * @require(qx.util.ResponseParser#parse)
 */
qx.Bootstrap.define("qx.util.ResponseParser",
{

  /**
   * @param parser {String|Function} See {@link #setParser}.
   */
  construct: function(parser) {
    if (parser !== undefined) {
      this.setParser(parser);
    }
  },

  statics:
  {
    /**
     * @type {Map} Map of parser functions. Parsers defined here can be
     * referenced symbolically, e.g. with {@link #setParser}.
     *
     * Known parsers are: <code>"json"</code> and <code>"xml"</code>.
     */
    PARSER: {
      json: qx.lang.Json.parse,
      xml: qx.xml.Document.fromString
    }
  },

  members :
  {
    __parser: null,

    /**
     * Returns given response parsed with parser
     * determined by {@link #_getParser}.
     *
     * @param response {String} response (e.g JSON/XML string)
     * @param contentType {String} contentType (e.g. 'application/json')
     * @return {String|Object} The parsed response of the request.
     */
    parse: function(response, contentType) {
      var parser = this._getParser(contentType);

      if (typeof parser === "function") {
        if (response !== "") {
          return parser.call(this, response);
        }
      }

      return response;
    },


    /**
     * Set parser used to parse response once request has
     * completed successfully.
     *
     * Usually, the parser is correctly inferred from the
     * content type of the response. This method allows to force the
     * parser being used, e.g. if the content type returned from
     * the backend is wrong or the response needs special parsing.
     *
     * Parser most typically used can be referenced symbolically.
     * To cover edge cases, a function can be given. When parsing
     * the response, this function is called with the raw response as
     * first argument.
     *
     * @param parser {String|Function}
     *
     * Can be:
     *
     * <ul>
     *   <li>A parser defined in {@link qx.util.ResponseParser#PARSER},
     *       referenced by string.</li>
     *   <li>The function to invoke.
     *       Receives the raw response as argument.</li>
     * </ul>
     *
     * @return {Function} The parser function
     */
    setParser: function(parser) {
      // Symbolically given known parser
      if (typeof qx.util.ResponseParser.PARSER[parser] === "function") {
        return this.__parser = qx.util.ResponseParser.PARSER[parser];
      }

      // If parser is not a symbol, it must be a function
      if (qx.core.Environment.get("qx.debug")) {
        qx.core.Assert.assertFunction(parser);
      }

      return this.__parser = parser;
    },


    /**
     * Gets the parser.
     *
     * If not defined explicitly using {@link #setParser},
     * the parser is inferred from the content type.
     *
     * Override this method to extend the list of content types
     * being handled.
     *
     * @param contentType {String}
     * @return {Function|null} The parser function or <code>null</code> if the
     * content type is undetermined.
     *
     */
    _getParser: function(contentType) {
      var parser = this.__parser,
          contentTypeOrig = "",
          contentTypeNormalized = "";

      // Use user-provided parser, if any
      if (parser) {
        return parser;
      }

      // See http://restpatterns.org/Glossary/MIME_Type

      contentTypeOrig = contentType || "";

      // Ignore parameters (e.g. the character set)
      contentTypeNormalized = contentTypeOrig.replace(/;.*$/, "");

      if ((/^application\/(\w|\.)*\+?json$/).test(contentTypeNormalized)) {
        parser = qx.util.ResponseParser.PARSER.json;
      }

      if ((/^application\/xml$/).test(contentTypeNormalized)) {
        parser = qx.util.ResponseParser.PARSER.xml;
      }

      // Deprecated
      if ((/[^\/]+\/[^\+]+\+xml$/).test(contentTypeOrig)) {
        parser = qx.util.ResponseParser.PARSER.xml;
      }

      return parser;
    }
  }
});


})();