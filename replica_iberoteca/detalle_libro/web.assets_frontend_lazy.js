/* /web/static/src/js/services/session.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.session", function (require) {
  "use strict";
  var Session = require("web.Session");
  var modules = odoo._modules;
  var session = new Session(undefined, undefined, {
    modules: modules,
    use_cors: false,
  });
  session.is_bound = session.session_bind();
  return session;
});

/* /web/static/src/js/public/public_crash_manager.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.PublicCrashManager", function (require) {
  "use strict";
  const core = require("web.core");
  const CrashManager = require("web.CrashManager").CrashManager;
  const PublicCrashManager = CrashManager.extend({
    _displayWarning(message, title, options) {
      this.displayNotification(
        Object.assign({}, options, { title, message, sticky: true }),
      );
    },
  });
  core.serviceRegistry.add("crash_manager", PublicCrashManager);
  return { CrashManager: PublicCrashManager };
});

/* /web/static/src/js/public/public_notification.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.public.Notification", function (require) {
  "use strict";
  var Notification = require("web.Notification");
  Notification.include({
    xmlDependencies: ["/web/static/src/xml/notification.xml"],
  });
});

/* /web/static/src/js/public/public_root.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.public.root", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var dom = require("web.dom");
  var ServiceProviderMixin = require("web.ServiceProviderMixin");
  var session = require("web.session");
  var utils = require("web.utils");
  var publicWidget = require("web.public.widget");
  var publicRootRegistry = new publicWidget.RootWidgetRegistry();
  function getLang() {
    var html = document.documentElement;
    return (html.getAttribute("lang") || "en_US").replace("-", "_");
  }
  var lang = utils.get_cookie("frontend_lang") || getLang();
  var localeDef = ajax.loadJS(
    "/web/webclient/locale/" + lang.replace("-", "_"),
  );
  window.addEventListener("unhandledrejection", function (ev) {
    if (!ev.reason || !(ev.reason instanceof Error)) {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      ev.preventDefault();
    }
  });
  var PublicRoot = publicWidget.RootWidget.extend(ServiceProviderMixin, {
    events: _.extend({}, publicWidget.RootWidget.prototype.events || {}, {
      "submit .js_website_submit_form": "_onWebsiteFormSubmit",
      "click .js_disable_on_click": "_onDisableOnClick",
    }),
    custom_events: _.extend(
      {},
      publicWidget.RootWidget.prototype.custom_events || {},
      {
        context_get: "_onContextGet",
        main_object_request: "_onMainObjectRequest",
        widgets_start_request: "_onWidgetsStartRequest",
        widgets_stop_request: "_onWidgetsStopRequest",
      },
    ),
    init: function () {
      this._super.apply(this, arguments);
      ServiceProviderMixin.init.call(this);
      this.publicWidgets = [];
    },
    willStart: function () {
      return Promise.all([
        this._super.apply(this, arguments),
        session.is_bound,
        localeDef,
      ]);
    },
    start: function () {
      var defs = [this._super.apply(this, arguments), this._startWidgets()];
      this.$(".o_image[data-mimetype^='image']").each(function () {
        var $img = $(this);
        if (/gif|jpe|jpg|png/.test($img.data("mimetype")) && $img.data("src")) {
          $img.css("background-image", "url('" + $img.data("src") + "')");
        }
      });
      if (window.location.hash.indexOf("scrollTop=") > -1) {
        this.el.scrollTop =
          +window.location.hash.match(/scrollTop=([0-9]+)/)[1];
      }
      if ($.fn.placeholder) {
        $("input, textarea").placeholder();
      }
      return Promise.all(defs);
    },
    _call_service: function (ev) {
      if (ev.data.service === "ajax" && ev.data.method === "rpc") {
        var route = ev.data.args[0];
        if (_.str.startsWith(route, "/web/dataset/call_kw/")) {
          var params = ev.data.args[1];
          var options = ev.data.args[2];
          var noContextKeys = undefined;
          if (options) {
            noContextKeys = options.noContextKeys;
            ev.data.args[2] = _.omit(options, "noContextKeys");
          }
          params.kwargs.context = _computeContext.call(
            this,
            params.kwargs.context,
            noContextKeys,
          );
        }
      } else if (ev.data.service === "ajax" && ev.data.method === "loadLibs") {
        ev.data.args[1] = _computeContext.call(this, ev.data.args[1]);
      }
      return ServiceProviderMixin._call_service.apply(this, arguments);
      function _computeContext(context, noContextKeys) {
        context = _.extend({}, this._getContext(), context);
        if (noContextKeys) {
          context = _.omit(context, noContextKeys);
        }
        return JSON.parse(JSON.stringify(context));
      }
    },
    _getContext: function (context) {
      return _.extend({ lang: getLang() }, context || {});
    },
    _getExtraContext: function (context) {
      return this._getContext(context);
    },
    _getPublicWidgetsRegistry: function (options) {
      return publicWidget.registry;
    },
    _getRegistry: function () {
      return publicRootRegistry;
    },
    _startWidgets: function ($from, options) {
      var self = this;
      if ($from === undefined) {
        $from = this.$("#wrapwrap");
        if (!$from.length) {
          $from = this.$el;
        }
      }
      if (options === undefined) {
        options = {};
      }
      this._stopWidgets($from);
      var defs = _.map(
        this._getPublicWidgetsRegistry(options),
        function (PublicWidget) {
          var selector = PublicWidget.prototype.selector || "";
          var $target = dom.cssFind($from, selector, true);
          var defs = _.map($target, function (el) {
            var widget = new PublicWidget(self, options);
            self.publicWidgets.push(widget);
            return widget.attachTo($(el));
          });
          return Promise.all(defs);
        },
      );
      return Promise.all(defs);
    },
    _stopWidgets: function ($from) {
      var removedWidgets = _.map(this.publicWidgets, function (widget) {
        if (
          !$from ||
          $from.filter(widget.el).length ||
          $from.find(widget.el).length
        ) {
          widget.destroy();
          return widget;
        }
        return null;
      });
      this.publicWidgets = _.difference(this.publicWidgets, removedWidgets);
    },
    _onContextGet: function (ev) {
      if (ev.data.extra) {
        ev.data.callback(this._getExtraContext(ev.data.context));
      } else {
        ev.data.callback(this._getContext(ev.data.context));
      }
    },
    _onMainObjectRequest: function (ev) {
      var repr = $("html").data("main-object");
      var m = repr.match(/(.+)\((\d+),(.*)\)/);
      ev.data.callback({ model: m[1], id: m[2] | 0 });
    },
    _onWidgetsStartRequest: function (ev) {
      this._startWidgets(ev.data.$target, ev.data.options)
        .then(ev.data.onSuccess)
        .guardedCatch(ev.data.onFailure);
    },
    _onWidgetsStopRequest: function (ev) {
      this._stopWidgets(ev.data.$target);
    },
    _onWebsiteFormSubmit: function (ev) {
      var $buttons = $(ev.currentTarget).find(
        'button[type="submit"], a.a-submit',
      );
      _.each($buttons, function (btn) {
        var $btn = $(btn);
        $btn.html('<i class="fa fa-spinner fa-spin"></i> ' + $btn.text());
        $btn.prop("disabled", true);
      });
    },
    _onDisableOnClick: function (ev) {
      $(ev.currentTarget).addClass("disabled");
    },
  });
  return { PublicRoot: PublicRoot, publicRootRegistry: publicRootRegistry };
});

/* /website/static/src/js/content/website_root_instance.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("root.widget", function (require) {
  "use strict";
  var lazyloader = require("web.public.lazyloader");
  var websiteRootData = require("website.root");
  var websiteRoot = new websiteRootData.WebsiteRoot(null);
  return lazyloader.allScriptsLoaded.then(function () {
    return websiteRoot.attachTo(document.body).then(function () {
      return websiteRoot;
    });
  });
});

/* /web/static/src/js/public/public_widget.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web.public.widget", function (require) {
  "use strict";
  var Class = require("web.Class");
  var dom = require("web.dom");
  var mixins = require("web.mixins");
  var session = require("web.session");
  var Widget = require("web.Widget");
  var RootWidget = Widget.extend({
    custom_events: _.extend({}, Widget.prototype.custom_events || {}, {
      registry_update: "_onRegistryUpdate",
      get_session: "_onGetSession",
    }),
    init: function () {
      this._super.apply(this, arguments);
      this._widgets = [];
      this._listenToUpdates = false;
      this._getRegistry().setParent(this);
    },
    start: function () {
      var defs = [this._super.apply(this, arguments)];
      defs.push(this._attachComponents());
      this._listenToUpdates = true;
      return Promise.all(defs);
    },
    _attachComponent: function (childInfo, $from) {
      var self = this;
      var $elements = dom.cssFind($from || this.$el, childInfo.selector);
      var defs = _.map($elements, function (element) {
        var w = new childInfo.Widget(self);
        self._widgets.push(w);
        return w.attachTo(element);
      });
      return Promise.all(defs);
    },
    _attachComponents: function ($from) {
      var self = this;
      var childInfos = this._getRegistry().get();
      var defs = _.map(childInfos, function (childInfo) {
        return self._attachComponent(childInfo, $from);
      });
      return Promise.all(defs);
    },
    _getRegistry: function () {},
    _onGetSession: function (event) {
      if (event.data.callback) {
        event.data.callback(session);
      }
    },
    _onRegistryUpdate: function (ev) {
      ev.stopPropagation();
      if (this._listenToUpdates) {
        this._attachComponent(ev.data);
      }
    },
  });
  var RootWidgetRegistry = Class.extend(mixins.EventDispatcherMixin, {
    init: function () {
      mixins.EventDispatcherMixin.init.call(this);
      this._registry = [];
    },
    add: function (Widget, selector) {
      var registryInfo = { Widget: Widget, selector: selector };
      this._registry.push(registryInfo);
      this.trigger_up("registry_update", registryInfo);
    },
    get: function () {
      return this._registry;
    },
  });
  var PublicWidget = Widget.extend({
    selector: false,
    events: {},
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.options = options || {};
    },
    destroy: function () {
      if (this.selector) {
        var $oldel = this.$el;
        this.setElement(null);
      }
      this._super.apply(this, arguments);
      if (this.selector) {
        this.$el = $oldel;
        this.el = $oldel[0];
        this.$target = this.$el;
        this.target = this.el;
      }
    },
    setElement: function () {
      this._super.apply(this, arguments);
      if (this.selector) {
        this.$target = this.$el;
        this.target = this.el;
      }
    },
    _delegateEvents: function () {
      var self = this;
      var originalEvents = this.events;
      var events = {};
      _.each(this.events, function (method, event) {
        if (typeof method !== "string") {
          events[event] = method;
          return;
        }
        var methodOptions = method.split(" ");
        if (methodOptions.length <= 1) {
          events[event] = method;
          return;
        }
        var isAsync = _.contains(methodOptions, "async");
        if (!isAsync) {
          events[event] = method;
          return;
        }
        method = self.proxy(methodOptions[methodOptions.length - 1]);
        if (_.str.startsWith(event, "click")) {
          method = dom.makeButtonHandler(method);
        } else {
          method = dom.makeAsyncHandler(method);
        }
        events[event] = method;
      });
      this.events = events;
      this._super.apply(this, arguments);
      this.events = originalEvents;
    },
    _getContext: function (extra, extraContext) {
      var context;
      this.trigger_up("context_get", {
        extra: extra || false,
        context: extraContext,
        callback: function (ctx) {
          context = ctx;
        },
      });
      return context;
    },
  });
  var registry = {};
  registry._fixAppleCollapse = PublicWidget.extend({
    selector: 'div[data-toggle="collapse"]',
    events: { click: function () {} },
  });
  return {
    RootWidget: RootWidget,
    RootWidgetRegistry: RootWidgetRegistry,
    Widget: PublicWidget,
    registry: registry,
  };
});

/* /web_editor/static/src/js/frontend/loader.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web_editor.loader", function (require) {
  "use strict";
  var Wysiwyg = require("web_editor.wysiwyg.root");
  function load(parent, textarea, options) {
    var loading = textarea.nextElementSibling;
    if (loading && !loading.classList.contains("o_wysiwyg_loading")) {
      loading = null;
    }
    if (!textarea.value.match(/\S/)) {
      textarea.value = "<p><br/></p>";
    }
    var wysiwyg = new Wysiwyg(parent, options);
    return wysiwyg.attachTo(textarea).then(() => {
      if (loading) {
        loading.parentNode.removeChild(loading);
      }
      return wysiwyg;
    });
  }
  return { load: load };
});

/* /portal/static/src/js/portal.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.portal", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.portalDetails = publicWidget.Widget.extend({
    selector: ".o_portal_details",
    events: { 'change select[name="country_id"]': "_onCountryChange" },
    start: function () {
      var def = this._super.apply(this, arguments);
      this.$state = this.$('select[name="state_id"]');
      this.$stateOptions = this.$state
        .filter(":enabled")
        .find("option:not(:first)");
      this._adaptAddressForm();
      return def;
    },
    _adaptAddressForm: function () {
      var $country = this.$('select[name="country_id"]');
      var countryID = $country.val() || 0;
      this.$stateOptions.detach();
      var $displayedState = this.$stateOptions.filter(
        "[data-country_id=" + countryID + "]",
      );
      var nb = $displayedState.appendTo(this.$state).show().length;
      this.$state.parent().toggle(nb >= 1);
    },
    _onCountryChange: function () {
      this._adaptAddressForm();
    },
  });
  publicWidget.registry.portalSearchPanel = publicWidget.Widget.extend({
    selector: ".o_portal_search_panel",
    events: {
      "click .search-submit": "_onSearchSubmitClick",
      "click .dropdown-item": "_onDropdownItemClick",
      'keyup input[name="search"]': "_onSearchInputKeyup",
    },
    start: function () {
      var def = this._super.apply(this, arguments);
      this._adaptSearchLabel(this.$(".dropdown-item.active"));
      return def;
    },
    _adaptSearchLabel: function (elem) {
      var $label = $(elem).clone();
      $label.find("span.nolabel").remove();
      this.$('input[name="search"]').attr("placeholder", $label.text().trim());
    },
    _search: function () {
      var search = $.deparam(window.location.search.substring(1));
      search["search_in"] = this.$(".dropdown-item.active")
        .attr("href")
        .replace("#", "");
      search["search"] = this.$('input[name="search"]').val();
      window.location.search = $.param(search);
    },
    _onSearchSubmitClick: function () {
      this._search();
    },
    _onDropdownItemClick: function (ev) {
      ev.preventDefault();
      var $item = $(ev.currentTarget);
      $item
        .closest(".dropdown-menu")
        .find(".dropdown-item")
        .removeClass("active");
      $item.addClass("active");
      this._adaptSearchLabel(ev.currentTarget);
    },
    _onSearchInputKeyup: function (ev) {
      if (ev.keyCode === $.ui.keyCode.ENTER) {
        this._search();
      }
    },
  });
});

/* /portal/static/src/js/portal_chatter.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.chatter", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var time = require("web.time");
  var portalComposer = require("portal.composer");
  var qweb = core.qweb;
  var _t = core._t;
  var PortalChatter = publicWidget.Widget.extend({
    template: "portal.Chatter",
    xmlDependencies: ["/portal/static/src/xml/portal_chatter.xml"],
    events: { "click .o_portal_chatter_pager_btn": "_onClickPager" },
    init: function (parent, options) {
      var self = this;
      this.options = {};
      this._super.apply(this, arguments);
      _.each(options, function (val, key) {
        self.options[_.str.underscored(key)] = val;
      });
      this.options = _.defaults(this.options, {
        allow_composer: true,
        display_composer: false,
        csrf_token: odoo.csrf_token,
        message_count: 0,
        pager_step: 10,
        pager_scope: 5,
        pager_start: 1,
        is_user_public: true,
        is_user_publisher: false,
        hash: false,
        pid: false,
        domain: [],
      });
      this.set("messages", []);
      this.set("message_count", this.options["message_count"]);
      this.set("pager", {});
      this.set("domain", this.options["domain"]);
      this._currentPage = this.options["pager_start"];
    },
    willStart: function () {
      return Promise.all([
        this._super.apply(this, arguments),
        this._chatterInit(),
      ]);
    },
    start: function () {
      this.on("change:messages", this, this._renderMessages);
      this.on("change:message_count", this, function () {
        this._renderMessageCount();
        this.set("pager", this._pager(this._currentPage));
      });
      this.on("change:pager", this, this._renderPager);
      this.on("change:domain", this, this._onChangeDomain);
      this.set("message_count", this.options["message_count"]);
      this.set("messages", this.preprocessMessages(this.result["messages"]));
      var defs = [];
      defs.push(this._super.apply(this, arguments));
      if (this.options["display_composer"]) {
        this._composer = new portalComposer.PortalComposer(this, this.options);
        defs.push(this._composer.replace(this.$(".o_portal_chatter_composer")));
      }
      return Promise.all(defs);
    },
    messageFetch: function (domain) {
      var self = this;
      return this._rpc({
        route: "/mail/chatter_fetch",
        params: self._messageFetchPrepareParams(),
      }).then(function (result) {
        self.set("messages", self.preprocessMessages(result["messages"]));
        self.set("message_count", result["message_count"]);
      });
    },
    preprocessMessages: function (messages) {
      _.each(messages, function (m) {
        m["author_avatar_url"] = _.str.sprintf(
          "/web/image/%s/%s/author_avatar/50x50",
          "mail.message",
          m.id,
        );
        m["published_date_str"] = _.str.sprintf(
          _t("Published on %s"),
          moment(time.str_to_datetime(m.date)).format(
            "MMMM Do YYYY, h:mm:ss a",
          ),
        );
      });
      return messages;
    },
    _chatterInit: function () {
      var self = this;
      return this._rpc({
        route: "/mail/chatter_init",
        params: this._messageFetchPrepareParams(),
      }).then(function (result) {
        self.result = result;
        self.options = _.extend(self.options, self.result["options"] || {});
        return result;
      });
    },
    _changeCurrentPage: function (page, domain) {
      this._currentPage = page;
      var d = domain ? domain : _.clone(this.get("domain"));
      this.set("domain", d);
    },
    _messageFetchPrepareParams: function () {
      var self = this;
      var data = {
        res_model: this.options["res_model"],
        res_id: this.options["res_id"],
        limit: this.options["pager_step"],
        offset: (this._currentPage - 1) * this.options["pager_step"],
        allow_composer: this.options["allow_composer"],
      };
      if (self.options["token"]) {
        data["token"] = self.options["token"];
      }
      if (this.get("domain")) {
        data["domain"] = this.get("domain");
      }
      return data;
    },
    _pager: function (page) {
      page = page || 1;
      var total = this.get("message_count");
      var scope = this.options["pager_scope"];
      var step = this.options["pager_step"];
      var pageCount = Math.ceil(parseFloat(total) / step);
      page = Math.max(1, Math.min(parseInt(page), pageCount));
      scope -= 1;
      var pmin = Math.max(page - parseInt(Math.floor(scope / 2)), 1);
      var pmax = Math.min(pmin + scope, pageCount);
      if (pmax - scope > 0) {
        pmin = pmax - scope;
      } else {
        pmin = 1;
      }
      var pages = [];
      _.each(_.range(pmin, pmax + 1), function (index) {
        pages.push(index);
      });
      return {
        page_count: pageCount,
        offset: (page - 1) * step,
        page: page,
        page_start: pmin,
        page_previous: Math.max(pmin, page - 1),
        page_next: Math.min(pmax, page + 1),
        page_end: pmax,
        pages: pages,
      };
    },
    _renderMessages: function () {
      this.$(".o_portal_chatter_messages").html(
        qweb.render("portal.chatter_messages", { widget: this }),
      );
    },
    _renderMessageCount: function () {
      this.$(".o_message_counter").replaceWith(
        qweb.render("portal.chatter_message_count", { widget: this }),
      );
    },
    _renderPager: function () {
      this.$(".o_portal_chatter_pager").replaceWith(
        qweb.render("portal.pager", { widget: this }),
      );
    },
    _onChangeDomain: function () {
      var self = this;
      this.messageFetch().then(function () {
        var p = self._currentPage;
        self.set("pager", self._pager(p));
      });
    },
    _onClickPager: function (ev) {
      ev.preventDefault();
      var page = $(ev.currentTarget).data("page");
      this._changeCurrentPage(page);
    },
  });
  publicWidget.registry.portalChatter = publicWidget.Widget.extend({
    selector: ".o_portal_chatter",
    start: function () {
      var self = this;
      var defs = [this._super.apply(this, arguments)];
      var chatter = new PortalChatter(this, this.$el.data());
      defs.push(chatter.appendTo(this.$el));
      return Promise.all(defs).then(function () {
        if (window.location.hash === "#" + self.$el.attr("id")) {
          $("html, body").scrollTop(self.$el.offset().top);
        }
      });
    },
  });
  return { PortalChatter: PortalChatter };
});

/* /portal/static/src/js/portal_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.composer", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var qweb = core.qweb;
  var _t = core._t;
  var PortalComposer = publicWidget.Widget.extend({
    template: "portal.Composer",
    xmlDependencies: ["/portal/static/src/xml/portal_chatter.xml"],
    events: {
      "change .o_portal_chatter_file_input": "_onFileInputChange",
      "click .o_portal_chatter_attachment_btn": "_onAttachmentButtonClick",
      "click .o_portal_chatter_attachment_delete":
        "async _onAttachmentDeleteClick",
      "click .o_portal_chatter_composer_btn": "async _onSubmitButtonClick",
    },
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.options = _.defaults(options || {}, {
        allow_composer: true,
        display_composer: false,
        csrf_token: odoo.csrf_token,
        token: false,
        res_model: false,
        res_id: false,
      });
      this.attachments = [];
    },
    start: function () {
      var self = this;
      this.$attachmentButton = this.$(".o_portal_chatter_attachment_btn");
      this.$fileInput = this.$(".o_portal_chatter_file_input");
      this.$sendButton = this.$(".o_portal_chatter_composer_btn");
      this.$attachments = this.$(
        ".o_portal_chatter_composer_form .o_portal_chatter_attachments",
      );
      this.$attachmentIds = this.$(".o_portal_chatter_attachment_ids");
      this.$attachmentTokens = this.$(".o_portal_chatter_attachment_tokens");
      return this._super.apply(this, arguments).then(function () {
        if (self.options.default_attachment_ids) {
          self.attachments = self.options.default_attachment_ids || [];
          _.each(self.attachments, function (attachment) {
            attachment.state = "done";
          });
          self._updateAttachments();
        }
        return Promise.resolve();
      });
    },
    _onAttachmentButtonClick: function () {
      this.$fileInput.click();
    },
    _onAttachmentDeleteClick: function (ev) {
      var self = this;
      var attachmentId = $(ev.currentTarget)
        .closest(".o_portal_chatter_attachment")
        .data("id");
      var accessToken = _.find(this.attachments, {
        id: attachmentId,
      }).access_token;
      ev.preventDefault();
      ev.stopPropagation();
      this.$sendButton.prop("disabled", true);
      return this._rpc({
        route: "/portal/attachment/remove",
        params: { attachment_id: attachmentId, access_token: accessToken },
      }).then(function () {
        self.attachments = _.reject(self.attachments, { id: attachmentId });
        self._updateAttachments();
        self.$sendButton.prop("disabled", false);
      });
    },
    _onFileInputChange: function () {
      var self = this;
      this.$sendButton.prop("disabled", true);
      return Promise.all(
        _.map(this.$fileInput[0].files, function (file) {
          return new Promise(function (resolve, reject) {
            var data = {
              name: file.name,
              file: file,
              res_id: self.options.res_id,
              res_model: self.options.res_model,
              access_token: self.options.token,
            };
            ajax
              .post("/portal/attachment/add", data)
              .then(function (attachment) {
                attachment.state = "pending";
                self.attachments.push(attachment);
                self._updateAttachments();
                resolve();
              })
              .guardedCatch(function (error) {
                self.displayNotification({
                  title: _t("Something went wrong."),
                  message: _.str.sprintf(
                    _t("The file <strong>%s</strong> could not be saved."),
                    _.escape(file.name),
                  ),
                  type: "warning",
                  sticky: true,
                });
                resolve();
              });
          });
        }),
      ).then(function () {
        self.$fileInput[0].value = null;
        self.$sendButton.prop("disabled", false);
      });
    },
    _onSubmitButtonClick: function () {
      return new Promise(function (resolve, reject) {});
    },
    _updateAttachments: function () {
      this.$attachmentIds.val(_.pluck(this.attachments, "id"));
      this.$attachmentTokens.val(_.pluck(this.attachments, "access_token"));
      this.$attachments.html(
        qweb.render("portal.Chatter.Attachments", {
          attachments: this.attachments,
          showDelete: true,
        }),
      );
    },
  });
  return { PortalComposer: PortalComposer };
});

/* /portal/static/src/js/portal_signature.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.signature_form", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var NameAndSignature = require("web.name_and_signature").NameAndSignature;
  var qweb = core.qweb;
  var _t = core._t;
  var SignatureForm = publicWidget.Widget.extend({
    template: "portal.portal_signature",
    xmlDependencies: ["/portal/static/src/xml/portal_signature.xml"],
    events: { "click .o_portal_sign_submit": "async _onClickSignSubmit" },
    custom_events: { signature_changed: "_onChangeSignature" },
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.csrf_token = odoo.csrf_token;
      this.callUrl = options.callUrl || "";
      this.rpcParams = options.rpcParams || {};
      this.sendLabel = options.sendLabel || _t("Accept & Sign");
      this.nameAndSignature = new NameAndSignature(
        this,
        options.nameAndSignatureOptions || {},
      );
    },
    start: function () {
      var self = this;
      this.$confirm_btn = this.$(".o_portal_sign_submit");
      this.$controls = this.$(".o_portal_sign_controls");
      var subWidgetStart = this.nameAndSignature.replace(
        this.$(".o_web_sign_name_and_signature"),
      );
      return Promise.all([
        subWidgetStart,
        this._super.apply(this, arguments),
      ]).then(function () {
        self.nameAndSignature.resetSignature();
      });
    },
    focusName: function () {
      this.nameAndSignature.focusName();
    },
    resetSignature: function () {
      return this.nameAndSignature.resetSignature();
    },
    _onClickSignSubmit: function (ev) {
      var self = this;
      ev.preventDefault();
      if (!this.nameAndSignature.validateSignature()) {
        return;
      }
      var name = this.nameAndSignature.getName();
      var signature = this.nameAndSignature.getSignatureImage()[1];
      return this._rpc({
        route: this.callUrl,
        params: _.extend(this.rpcParams, { name: name, signature: signature }),
      }).then(function (data) {
        if (data.error) {
          self.$(".o_portal_sign_error_msg").remove();
          self.$controls.prepend(
            qweb.render("portal.portal_signature_error", { widget: data }),
          );
        } else if (data.success) {
          var $success = qweb.render("portal.portal_signature_success", {
            widget: data,
          });
          self.$el.empty().append($success);
        }
        if (data.force_refresh) {
          if (data.redirect_url) {
            window.location = data.redirect_url;
          } else {
            window.location.reload();
          }
          return new Promise(function () {});
        }
      });
    },
    _onChangeSignature: function () {
      var isEmpty = this.nameAndSignature.isSignatureEmpty();
      this.$confirm_btn.prop("disabled", isEmpty);
    },
  });
  publicWidget.registry.SignatureForm = publicWidget.Widget.extend({
    selector: ".o_portal_signature_form",
    start: function () {
      var hasBeenReset = false;
      var callUrl = this.$el.data("call-url");
      var nameAndSignatureOptions = {
        defaultName: this.$el.data("default-name"),
        mode: this.$el.data("mode"),
        displaySignatureRatio: this.$el.data("signature-ratio"),
        signatureType: this.$el.data("signature-type"),
      };
      var sendLabel = this.$el.data("send-label");
      var form = new SignatureForm(this, {
        callUrl: callUrl,
        nameAndSignatureOptions: nameAndSignatureOptions,
        sendLabel: sendLabel,
      });
      this.$el.closest(".modal").on("shown.bs.modal", function (ev) {
        if (!hasBeenReset) {
          hasBeenReset = true;
          form.resetSignature();
        } else {
          form.focusName();
        }
      });
      return Promise.all([
        this._super.apply(this, arguments),
        form.appendTo(this.$el),
      ]);
    },
  });
  return { SignatureForm: SignatureForm };
});

/* /portal/static/src/js/portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.PortalSidebar", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var time = require("web.time");
  var session = require("web.session");
  var _t = core._t;
  var PortalSidebar = publicWidget.Widget.extend({
    start: function () {
      this._setDelayLabel();
      return this._super.apply(this, arguments);
    },
    _setDelayLabel: function () {
      var $sidebarTimeago = this.$el.find(".o_portal_sidebar_timeago");
      _.each($sidebarTimeago, function (el) {
        var dateTime = moment(time.auto_str_to_date($(el).attr("datetime"))),
          today = moment().startOf("day"),
          diff = dateTime.diff(today, "days", true),
          displayStr;
        session.is_bound.then(function () {
          if (diff === 0) {
            displayStr = _t("Due today");
          } else if (diff > 0) {
            displayStr = _.str.sprintf(_t("Due in %1d days"), Math.abs(diff));
          } else {
            displayStr = _.str.sprintf(_t("%1d days overdue"), Math.abs(diff));
          }
          $(el).text(displayStr);
        });
      });
    },
    _printIframeContent: function (href) {
      if ($.browser.mozilla) {
        window.open(href, "_blank");
        return;
      }
      if (!this.printContent) {
        this.printContent = $(
          '<iframe id="print_iframe_content" src="' +
            href +
            '" style="display:none"></iframe>',
        );
        this.$el.append(this.printContent);
        this.printContent.on("load", function () {
          $(this).get(0).contentWindow.print();
        });
      } else {
        this.printContent.get(0).contentWindow.print();
      }
    },
  });
  return PortalSidebar;
});

/* /website/static/lib/jstz.min.js defined in bundle 'web.assets_frontend_lazy' */
!(function (e) {
  var a = (function () {
    "use strict";
    var e = "s",
      s = {
        DAY: 864e5,
        HOUR: 36e5,
        MINUTE: 6e4,
        SECOND: 1e3,
        BASELINE_YEAR: 2014,
        MAX_SCORE: 864e6,
        AMBIGUITIES: {
          "America/Denver": ["America/Mazatlan"],
          "Europe/London": ["Africa/Casablanca"],
          "America/Chicago": ["America/Mexico_City"],
          "America/Asuncion": ["America/Campo_Grande", "America/Santiago"],
          "America/Montevideo": ["America/Sao_Paulo", "America/Santiago"],
          "Asia/Beirut": [
            "Asia/Amman",
            "Asia/Jerusalem",
            "Europe/Helsinki",
            "Asia/Damascus",
            "Africa/Cairo",
            "Asia/Gaza",
            "Europe/Minsk",
          ],
          "Pacific/Auckland": ["Pacific/Fiji"],
          "America/Los_Angeles": ["America/Santa_Isabel"],
          "America/New_York": ["America/Havana"],
          "America/Halifax": ["America/Goose_Bay"],
          "America/Godthab": ["America/Miquelon"],
          "Asia/Dubai": ["Asia/Yerevan"],
          "Asia/Jakarta": ["Asia/Krasnoyarsk"],
          "Asia/Shanghai": ["Asia/Irkutsk", "Australia/Perth"],
          "Australia/Sydney": ["Australia/Lord_Howe"],
          "Asia/Tokyo": ["Asia/Yakutsk"],
          "Asia/Dhaka": ["Asia/Omsk"],
          "Asia/Baku": ["Asia/Yerevan"],
          "Australia/Brisbane": ["Asia/Vladivostok"],
          "Pacific/Noumea": ["Asia/Vladivostok"],
          "Pacific/Majuro": ["Asia/Kamchatka", "Pacific/Fiji"],
          "Pacific/Tongatapu": ["Pacific/Apia"],
          "Asia/Baghdad": ["Europe/Minsk", "Europe/Moscow"],
          "Asia/Karachi": ["Asia/Yekaterinburg"],
          "Africa/Johannesburg": ["Asia/Gaza", "Africa/Cairo"],
        },
      },
      i = function (e) {
        var a = -e.getTimezoneOffset();
        return null !== a ? a : 0;
      },
      r = function () {
        var a = i(new Date(s.BASELINE_YEAR, 0, 2)),
          r = i(new Date(s.BASELINE_YEAR, 5, 2)),
          n = a - r;
        return 0 > n ? a + ",1" : n > 0 ? r + ",1," + e : a + ",0";
      },
      n = function () {
        var e, a;
        if (
          "undefined" != typeof Intl &&
          "undefined" != typeof Intl.DateTimeFormat &&
          ((e = Intl.DateTimeFormat()),
          "undefined" != typeof e && "undefined" != typeof e.resolvedOptions)
        )
          return (
            (a = e.resolvedOptions().timeZone),
            a && (a.indexOf("/") > -1 || "UTC" === a) ? a : void 0
          );
      },
      o = function (e) {
        for (
          var a = new Date(e, 0, 1, 0, 0, 1, 0).getTime(),
            s = new Date(e, 12, 31, 23, 59, 59).getTime(),
            i = a,
            r = new Date(i).getTimezoneOffset(),
            n = null,
            o = null;
          s - 864e5 > i;
        ) {
          var t = new Date(i),
            A = t.getTimezoneOffset();
          (A !== r && (r > A && (n = t), A > r && (o = t), (r = A)),
            (i += 864e5));
        }
        return n && o ? { s: u(n).getTime(), e: u(o).getTime() } : !1;
      },
      u = function l(e, a, i) {
        "undefined" == typeof a && ((a = s.DAY), (i = s.HOUR));
        for (
          var r = new Date(e.getTime() - a).getTime(),
            n = e.getTime() + a,
            o = new Date(r).getTimezoneOffset(),
            u = r,
            t = null;
          n - i > u;
        ) {
          var A = new Date(u),
            c = A.getTimezoneOffset();
          if (c !== o) {
            t = A;
            break;
          }
          u += i;
        }
        return a === s.DAY
          ? l(t, s.HOUR, s.MINUTE)
          : a === s.HOUR
            ? l(t, s.MINUTE, s.SECOND)
            : t;
      },
      t = function (e, a, s, i) {
        if ("N/A" !== s) return s;
        if ("Asia/Beirut" === a) {
          if (
            "Africa/Cairo" === i.name &&
            13983768e5 === e[6].s &&
            14116788e5 === e[6].e
          )
            return 0;
          if (
            "Asia/Jerusalem" === i.name &&
            13959648e5 === e[6].s &&
            14118588e5 === e[6].e
          )
            return 0;
        } else if ("America/Santiago" === a) {
          if (
            "America/Asuncion" === i.name &&
            14124816e5 === e[6].s &&
            1397358e6 === e[6].e
          )
            return 0;
          if (
            "America/Campo_Grande" === i.name &&
            14136912e5 === e[6].s &&
            13925196e5 === e[6].e
          )
            return 0;
        } else if ("America/Montevideo" === a) {
          if (
            "America/Sao_Paulo" === i.name &&
            14136876e5 === e[6].s &&
            1392516e6 === e[6].e
          )
            return 0;
        } else if (
          "Pacific/Auckland" === a &&
          "Pacific/Fiji" === i.name &&
          14142456e5 === e[6].s &&
          13961016e5 === e[6].e
        )
          return 0;
        return s;
      },
      A = function (e, i) {
        for (
          var r = function (a) {
              for (var r = 0, n = 0; n < e.length; n++)
                if (a.rules[n] && e[n]) {
                  if (!(e[n].s >= a.rules[n].s && e[n].e <= a.rules[n].e)) {
                    r = "N/A";
                    break;
                  }
                  if (
                    ((r = 0),
                    (r += Math.abs(e[n].s - a.rules[n].s)),
                    (r += Math.abs(a.rules[n].e - e[n].e)),
                    r > s.MAX_SCORE)
                  ) {
                    r = "N/A";
                    break;
                  }
                }
              return (r = t(e, i, r, a));
            },
            n = {},
            o = a.olson.dst_rules.zones,
            u = o.length,
            A = s.AMBIGUITIES[i],
            c = 0;
          u > c;
          c++
        ) {
          var m = o[c],
            l = r(o[c]);
          "N/A" !== l && (n[m.name] = l);
        }
        for (var f in n)
          if (n.hasOwnProperty(f))
            for (var d = 0; d < A.length; d++) if (A[d] === f) return f;
        return i;
      },
      c = function (e) {
        var s = function () {
            for (var e = [], s = 0; s < a.olson.dst_rules.years.length; s++) {
              var i = o(a.olson.dst_rules.years[s]);
              e.push(i);
            }
            return e;
          },
          i = function (e) {
            for (var a = 0; a < e.length; a++) if (e[a] !== !1) return !0;
            return !1;
          },
          r = s(),
          n = i(r);
        return n ? A(r, e) : e;
      },
      m = function () {
        var e = n();
        return (
          e ||
            ((e = a.olson.timezones[r()]),
            "undefined" != typeof s.AMBIGUITIES[e] && (e = c(e))),
          {
            name: function () {
              return e;
            },
          }
        );
      };
    return { determine: m };
  })();
  ((a.olson = a.olson || {}),
    (a.olson.timezones = {
      "-720,0": "Etc/GMT+12",
      "-660,0": "Pacific/Pago_Pago",
      "-660,1,s": "Pacific/Apia",
      "-600,1": "America/Adak",
      "-600,0": "Pacific/Honolulu",
      "-570,0": "Pacific/Marquesas",
      "-540,0": "Pacific/Gambier",
      "-540,1": "America/Anchorage",
      "-480,1": "America/Los_Angeles",
      "-480,0": "Pacific/Pitcairn",
      "-420,0": "America/Phoenix",
      "-420,1": "America/Denver",
      "-360,0": "America/Guatemala",
      "-360,1": "America/Chicago",
      "-360,1,s": "Pacific/Easter",
      "-300,0": "America/Bogota",
      "-300,1": "America/New_York",
      "-270,0": "America/Caracas",
      "-240,1": "America/Halifax",
      "-240,0": "America/Santo_Domingo",
      "-240,1,s": "America/Asuncion",
      "-210,1": "America/St_Johns",
      "-180,1": "America/Godthab",
      "-180,0": "America/Argentina/Buenos_Aires",
      "-180,1,s": "America/Montevideo",
      "-120,0": "America/Noronha",
      "-120,1": "America/Noronha",
      "-60,1": "Atlantic/Azores",
      "-60,0": "Atlantic/Cape_Verde",
      "0,0": "UTC",
      "0,1": "Europe/London",
      "60,1": "Europe/Berlin",
      "60,0": "Africa/Lagos",
      "60,1,s": "Africa/Windhoek",
      "120,1": "Asia/Beirut",
      "120,0": "Africa/Johannesburg",
      "180,0": "Asia/Baghdad",
      "180,1": "Europe/Moscow",
      "210,1": "Asia/Tehran",
      "240,0": "Asia/Dubai",
      "240,1": "Asia/Baku",
      "270,0": "Asia/Kabul",
      "300,1": "Asia/Yekaterinburg",
      "300,0": "Asia/Karachi",
      "330,0": "Asia/Kolkata",
      "345,0": "Asia/Kathmandu",
      "360,0": "Asia/Dhaka",
      "360,1": "Asia/Omsk",
      "390,0": "Asia/Rangoon",
      "420,1": "Asia/Krasnoyarsk",
      "420,0": "Asia/Jakarta",
      "480,0": "Asia/Shanghai",
      "480,1": "Asia/Irkutsk",
      "525,0": "Australia/Eucla",
      "525,1,s": "Australia/Eucla",
      "540,1": "Asia/Yakutsk",
      "540,0": "Asia/Tokyo",
      "570,0": "Australia/Darwin",
      "570,1,s": "Australia/Adelaide",
      "600,0": "Australia/Brisbane",
      "600,1": "Asia/Vladivostok",
      "600,1,s": "Australia/Sydney",
      "630,1,s": "Australia/Lord_Howe",
      "660,1": "Asia/Kamchatka",
      "660,0": "Pacific/Noumea",
      "690,0": "Pacific/Norfolk",
      "720,1,s": "Pacific/Auckland",
      "720,0": "Pacific/Majuro",
      "765,1,s": "Pacific/Chatham",
      "780,0": "Pacific/Tongatapu",
      "780,1,s": "Pacific/Apia",
      "840,0": "Pacific/Kiritimati",
    }),
    (a.olson.dst_rules = {
      years: [2008, 2009, 2010, 2011, 2012, 2013, 2014],
      zones: [
        {
          name: "Africa/Cairo",
          rules: [
            { e: 12199572e5, s: 12090744e5 },
            { e: 1250802e6, s: 1240524e6 },
            { e: 12858804e5, s: 12840696e5 },
            !1,
            !1,
            !1,
            { e: 14116788e5, s: 1406844e6 },
          ],
        },
        {
          name: "Africa/Casablanca",
          rules: [
            { e: 12202236e5, s: 12122784e5 },
            { e: 12508092e5, s: 12438144e5 },
            { e: 1281222e6, s: 12727584e5 },
            { e: 13120668e5, s: 13017888e5 },
            { e: 13489704e5, s: 1345428e6 },
            { e: 13828392e5, s: 13761e8 },
            { e: 14142888e5, s: 14069448e5 },
          ],
        },
        {
          name: "America/Asuncion",
          rules: [
            { e: 12050316e5, s: 12243888e5 },
            { e: 12364812e5, s: 12558384e5 },
            { e: 12709548e5, s: 12860784e5 },
            { e: 13024044e5, s: 1317528e6 },
            { e: 1333854e6, s: 13495824e5 },
            { e: 1364094e6, s: 1381032e6 },
            { e: 13955436e5, s: 14124816e5 },
          ],
        },
        {
          name: "America/Campo_Grande",
          rules: [
            { e: 12032172e5, s: 12243888e5 },
            { e: 12346668e5, s: 12558384e5 },
            { e: 12667212e5, s: 1287288e6 },
            { e: 12981708e5, s: 13187376e5 },
            { e: 13302252e5, s: 1350792e6 },
            { e: 136107e7, s: 13822416e5 },
            { e: 13925196e5, s: 14136912e5 },
          ],
        },
        {
          name: "America/Goose_Bay",
          rules: [
            { e: 122559486e4, s: 120503526e4 },
            { e: 125704446e4, s: 123648486e4 },
            { e: 128909886e4, s: 126853926e4 },
            { e: 13205556e5, s: 129998886e4 },
            { e: 13520052e5, s: 13314456e5 },
            { e: 13834548e5, s: 13628952e5 },
            { e: 14149044e5, s: 13943448e5 },
          ],
        },
        {
          name: "America/Havana",
          rules: [
            { e: 12249972e5, s: 12056436e5 },
            { e: 12564468e5, s: 12364884e5 },
            { e: 12885012e5, s: 12685428e5 },
            { e: 13211604e5, s: 13005972e5 },
            { e: 13520052e5, s: 13332564e5 },
            { e: 13834548e5, s: 13628916e5 },
            { e: 14149044e5, s: 13943412e5 },
          ],
        },
        {
          name: "America/Mazatlan",
          rules: [
            { e: 1225008e6, s: 12074724e5 },
            { e: 12564576e5, s: 1238922e6 },
            { e: 1288512e6, s: 12703716e5 },
            { e: 13199616e5, s: 13018212e5 },
            { e: 13514112e5, s: 13332708e5 },
            { e: 13828608e5, s: 13653252e5 },
            { e: 14143104e5, s: 13967748e5 },
          ],
        },
        {
          name: "America/Mexico_City",
          rules: [
            { e: 12250044e5, s: 12074688e5 },
            { e: 1256454e6, s: 12389184e5 },
            { e: 12885084e5, s: 1270368e6 },
            { e: 1319958e6, s: 13018176e5 },
            { e: 13514076e5, s: 13332672e5 },
            { e: 13828572e5, s: 13653216e5 },
            { e: 14143068e5, s: 13967712e5 },
          ],
        },
        {
          name: "America/Miquelon",
          rules: [
            { e: 12255984e5, s: 12050388e5 },
            { e: 1257048e6, s: 12364884e5 },
            { e: 12891024e5, s: 12685428e5 },
            { e: 1320552e6, s: 12999924e5 },
            { e: 13520016e5, s: 1331442e6 },
            { e: 13834512e5, s: 13628916e5 },
            { e: 14149008e5, s: 13943412e5 },
          ],
        },
        {
          name: "America/Santa_Isabel",
          rules: [
            { e: 12250116e5, s: 1207476e6 },
            { e: 12564612e5, s: 12389256e5 },
            { e: 12885156e5, s: 12703752e5 },
            { e: 13199652e5, s: 13018248e5 },
            { e: 13514148e5, s: 13332744e5 },
            { e: 13828644e5, s: 13653288e5 },
            { e: 1414314e6, s: 13967784e5 },
          ],
        },
        {
          name: "America/Santiago",
          rules: [
            { e: 1206846e6, s: 1223784e6 },
            { e: 1237086e6, s: 12552336e5 },
            { e: 127035e7, s: 12866832e5 },
            { e: 13048236e5, s: 13138992e5 },
            { e: 13356684e5, s: 13465584e5 },
            { e: 1367118e6, s: 13786128e5 },
            { e: 13985676e5, s: 14100624e5 },
          ],
        },
        {
          name: "America/Sao_Paulo",
          rules: [
            { e: 12032136e5, s: 12243852e5 },
            { e: 12346632e5, s: 12558348e5 },
            { e: 12667176e5, s: 12872844e5 },
            { e: 12981672e5, s: 1318734e6 },
            { e: 13302216e5, s: 13507884e5 },
            { e: 13610664e5, s: 1382238e6 },
            { e: 1392516e6, s: 14136876e5 },
          ],
        },
        {
          name: "Asia/Amman",
          rules: [
            { e: 1225404e6, s: 12066552e5 },
            { e: 12568536e5, s: 12381048e5 },
            { e: 12883032e5, s: 12695544e5 },
            { e: 13197528e5, s: 13016088e5 },
            !1,
            !1,
            { e: 14147064e5, s: 13959576e5 },
          ],
        },
        {
          name: "Asia/Damascus",
          rules: [
            { e: 12254868e5, s: 120726e7 },
            { e: 125685e7, s: 12381048e5 },
            { e: 12882996e5, s: 12701592e5 },
            { e: 13197492e5, s: 13016088e5 },
            { e: 13511988e5, s: 13330584e5 },
            { e: 13826484e5, s: 1364508e6 },
            { e: 14147028e5, s: 13959576e5 },
          ],
        },
        { name: "Asia/Dubai", rules: [!1, !1, !1, !1, !1, !1, !1] },
        {
          name: "Asia/Gaza",
          rules: [
            { e: 12199572e5, s: 12066552e5 },
            { e: 12520152e5, s: 12381048e5 },
            { e: 1281474e6, s: 126964086e4 },
            { e: 1312146e6, s: 130160886e4 },
            { e: 13481784e5, s: 13330584e5 },
            { e: 13802292e5, s: 1364508e6 },
            { e: 1414098e6, s: 13959576e5 },
          ],
        },
        {
          name: "Asia/Irkutsk",
          rules: [
            { e: 12249576e5, s: 12068136e5 },
            { e: 12564072e5, s: 12382632e5 },
            { e: 12884616e5, s: 12697128e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Jerusalem",
          rules: [
            { e: 12231612e5, s: 12066624e5 },
            { e: 1254006e6, s: 1238112e6 },
            { e: 1284246e6, s: 12695616e5 },
            { e: 131751e7, s: 1301616e6 },
            { e: 13483548e5, s: 13330656e5 },
            { e: 13828284e5, s: 13645152e5 },
            { e: 1414278e6, s: 13959648e5 },
          ],
        },
        {
          name: "Asia/Kamchatka",
          rules: [
            { e: 12249432e5, s: 12067992e5 },
            { e: 12563928e5, s: 12382488e5 },
            { e: 12884508e5, s: 12696984e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Krasnoyarsk",
          rules: [
            { e: 12249612e5, s: 12068172e5 },
            { e: 12564108e5, s: 12382668e5 },
            { e: 12884652e5, s: 12697164e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Omsk",
          rules: [
            { e: 12249648e5, s: 12068208e5 },
            { e: 12564144e5, s: 12382704e5 },
            { e: 12884688e5, s: 126972e7 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Vladivostok",
          rules: [
            { e: 12249504e5, s: 12068064e5 },
            { e: 12564e8, s: 1238256e6 },
            { e: 12884544e5, s: 12697056e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Yakutsk",
          rules: [
            { e: 1224954e6, s: 120681e7 },
            { e: 12564036e5, s: 12382596e5 },
            { e: 1288458e6, s: 12697092e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Yekaterinburg",
          rules: [
            { e: 12249684e5, s: 12068244e5 },
            { e: 1256418e6, s: 1238274e6 },
            { e: 12884724e5, s: 12697236e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Asia/Yerevan",
          rules: [
            { e: 1224972e6, s: 1206828e6 },
            { e: 12564216e5, s: 12382776e5 },
            { e: 1288476e6, s: 12697272e5 },
            { e: 13199256e5, s: 13011768e5 },
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Australia/Lord_Howe",
          rules: [
            { e: 12074076e5, s: 12231342e5 },
            { e: 12388572e5, s: 12545838e5 },
            { e: 12703068e5, s: 12860334e5 },
            { e: 13017564e5, s: 1317483e6 },
            { e: 1333206e6, s: 13495374e5 },
            { e: 13652604e5, s: 1380987e6 },
            { e: 139671e7, s: 14124366e5 },
          ],
        },
        {
          name: "Australia/Perth",
          rules: [{ e: 12068136e5, s: 12249576e5 }, !1, !1, !1, !1, !1, !1],
        },
        {
          name: "Europe/Helsinki",
          rules: [
            { e: 12249828e5, s: 12068388e5 },
            { e: 12564324e5, s: 12382884e5 },
            { e: 12884868e5, s: 1269738e6 },
            { e: 13199364e5, s: 13011876e5 },
            { e: 1351386e6, s: 13326372e5 },
            { e: 13828356e5, s: 13646916e5 },
            { e: 14142852e5, s: 13961412e5 },
          ],
        },
        {
          name: "Europe/Minsk",
          rules: [
            { e: 12249792e5, s: 12068352e5 },
            { e: 12564288e5, s: 12382848e5 },
            { e: 12884832e5, s: 12697344e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Europe/Moscow",
          rules: [
            { e: 12249756e5, s: 12068316e5 },
            { e: 12564252e5, s: 12382812e5 },
            { e: 12884796e5, s: 12697308e5 },
            !1,
            !1,
            !1,
            !1,
          ],
        },
        {
          name: "Pacific/Apia",
          rules: [
            !1,
            !1,
            !1,
            { e: 13017528e5, s: 13168728e5 },
            { e: 13332024e5, s: 13489272e5 },
            { e: 13652568e5, s: 13803768e5 },
            { e: 13967064e5, s: 14118264e5 },
          ],
        },
        {
          name: "Pacific/Fiji",
          rules: [
            !1,
            !1,
            { e: 12696984e5, s: 12878424e5 },
            { e: 13271544e5, s: 1319292e6 },
            { e: 1358604e6, s: 13507416e5 },
            { e: 139005e7, s: 1382796e6 },
            { e: 14215032e5, s: 14148504e5 },
          ],
        },
        {
          name: "Europe/London",
          rules: [
            { e: 12249828e5, s: 12068388e5 },
            { e: 12564324e5, s: 12382884e5 },
            { e: 12884868e5, s: 1269738e6 },
            { e: 13199364e5, s: 13011876e5 },
            { e: 1351386e6, s: 13326372e5 },
            { e: 13828356e5, s: 13646916e5 },
            { e: 14142852e5, s: 13961412e5 },
          ],
        },
      ],
    }),
    "undefined" != typeof module && "undefined" != typeof module.exports
      ? (module.exports = a)
      : "undefined" != typeof define && null !== define && null != define.amd
        ? define([], function () {
            return a;
          })
        : "undefined" == typeof e
          ? (window.jstz = a)
          : (e.jstz = a));
})();

/* /website/static/src/js/utils.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.utils", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var core = require("web.core");
  var qweb = core.qweb;
  function loadAnchors(url) {
    return new Promise(function (resolve, reject) {
      if (url !== window.location.pathname && url[0] !== "#") {
        $.get(window.location.origin + url).then(resolve, reject);
      } else {
        resolve(document.body.outerHTML);
      }
    }).then(function (response) {
      return _.map($(response).find("[id][data-anchor=true]"), function (el) {
        return "#" + el.id;
      });
    });
  }
  function autocompleteWithPages(self, $input) {
    $input.autocomplete({
      source: function (request, response) {
        if (request.term[0] === "#") {
          loadAnchors(request.term).then(function (anchors) {
            response(anchors);
          });
        } else {
          return self
            ._rpc({
              model: "website",
              method: "search_pages",
              args: [null, request.term],
              kwargs: { limit: 15 },
            })
            .then(function (exists) {
              var rs = _.map(exists, function (r) {
                return r.loc;
              });
              response(rs.sort());
            });
        }
      },
      close: function () {
        self.trigger_up("website_url_chosen");
      },
    });
  }
  function onceAllImagesLoaded($element) {
    var defs = _.map($element.find("img").addBack("img"), function (img) {
      if (img.complete) {
        return;
      }
      var def = new Promise(function (resolve, reject) {
        $(img).one("load", function () {
          resolve();
        });
      });
      return def;
    });
    return Promise.all(defs);
  }
  function prompt(options, _qweb) {
    if (typeof options === "string") {
      options = { text: options };
    }
    var xmlDef;
    if (_.isUndefined(_qweb)) {
      _qweb = "website.prompt";
      xmlDef = ajax.loadXML("/website/static/src/xml/website.xml", core.qweb);
    }
    options = _.extend(
      { window_title: "", field_name: "", default: "", init: function () {} },
      options || {},
    );
    var type = _.intersection(Object.keys(options), [
      "input",
      "textarea",
      "select",
    ]);
    type = type.length ? type[0] : "input";
    options.field_type = type;
    options.field_name = options.field_name || options[type];
    var def = new Promise(function (resolve, reject) {
      Promise.resolve(xmlDef).then(function () {
        var dialog = $(qweb.render(_qweb, options)).appendTo("body");
        options.$dialog = dialog;
        var field = dialog.find(options.field_type).first();
        field.val(options["default"]);
        field.fillWith = function (data) {
          if (field.is("select")) {
            var select = field[0];
            data.forEach(function (item) {
              select.options[select.options.length] = new window.Option(
                item[1],
                item[0],
              );
            });
          } else {
            field.val(data);
          }
        };
        var init = options.init(field, dialog);
        Promise.resolve(init).then(function (fill) {
          if (fill) {
            field.fillWith(fill);
          }
          dialog.modal("show");
          field.focus();
          dialog.on("click", ".btn-primary", function () {
            var backdrop = $(".modal-backdrop");
            resolve({ val: field.val(), field: field, dialog: dialog });
            dialog.modal("hide").remove();
            backdrop.remove();
          });
        });
        dialog.on("hidden.bs.modal", function () {
          var backdrop = $(".modal-backdrop");
          reject();
          dialog.remove();
          backdrop.remove();
        });
        if (field.is('input[type="text"], select')) {
          field.keypress(function (e) {
            if (e.which === 13) {
              e.preventDefault();
              dialog.find(".btn-primary").trigger("click");
            }
          });
        }
      });
    });
    return def;
  }
  function websiteDomain(self) {
    var websiteID;
    self.trigger_up("context_get", {
      callback: function (ctx) {
        websiteID = ctx["website_id"];
      },
    });
    return ["|", ["website_id", "=", false], ["website_id", "=", websiteID]];
  }
  function svgToPNG(src, noAsync = false) {
    function checkImg(imgEl) {
      return imgEl.naturalHeight !== 0;
    }
    function toPNGViaCanvas(imgEl) {
      const canvas = document.createElement("canvas");
      canvas.width = imgEl.width;
      canvas.height = imgEl.height;
      canvas.getContext("2d").drawImage(imgEl, 0, 0);
      return canvas.toDataURL("image/png");
    }
    if (src instanceof HTMLImageElement) {
      const loadedImgEl = src;
      if (noAsync || checkImg(loadedImgEl)) {
        return toPNGViaCanvas(loadedImgEl);
      }
      src = loadedImgEl.src;
    }
    return new Promise((resolve) => {
      const imgEl = new Image();
      imgEl.onload = () => {
        if (checkImg(imgEl)) {
          resolve(imgEl);
          return;
        }
        imgEl.height = 1000;
        imgEl.style.opacity = 0;
        document.body.appendChild(imgEl);
        const request = new XMLHttpRequest();
        request.open("GET", imgEl.src, true);
        request.onload = () => {
          const parser = new DOMParser();
          const result = parser.parseFromString(
            request.responseText,
            "text/xml",
          );
          const svgEl = result.getElementsByTagName("svg")[0];
          svgEl.setAttribute("width", imgEl.width);
          svgEl.setAttribute("height", imgEl.height);
          imgEl.remove();
          const svg64 = btoa(new XMLSerializer().serializeToString(svgEl));
          const finalImg = new Image();
          finalImg.onload = () => {
            resolve(finalImg);
          };
          finalImg.src = `data:image/svg+xml;base64,${svg64}`;
        };
        request.send();
      };
      imgEl.src = src;
    }).then((loadedImgEl) => toPNGViaCanvas(loadedImgEl));
  }
  return {
    loadAnchors: loadAnchors,
    autocompleteWithPages: autocompleteWithPages,
    onceAllImagesLoaded: onceAllImagesLoaded,
    prompt: prompt,
    websiteDomain: websiteDomain,
    svgToPNG: svgToPNG,
  };
});

/* /website/static/src/js/content/website_root.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.root", function (require) {
  "use strict";
  var core = require("web.core");
  var Dialog = require("web.Dialog");
  var publicRootData = require("web.public.root");
  require("web.zoomodoo");
  var _t = core._t;
  var websiteRootRegistry = publicRootData.publicRootRegistry;
  var WebsiteRoot = publicRootData.PublicRoot.extend({
    events: _.extend({}, publicRootData.PublicRoot.prototype.events || {}, {
      "click .js_change_lang": "_onLangChangeClick",
      "click .js_publish_management .js_publish_btn": "_onPublishBtnClick",
      "click .js_multi_website_switch": "_onWebsiteSwitch",
      "shown.bs.modal": "_onModalShown",
    }),
    custom_events: _.extend(
      {},
      publicRootData.PublicRoot.prototype.custom_events || {},
      {
        ready_to_clean_for_save: "_onWidgetsStopRequest",
        will_remove_snippet: "_onWidgetsStopRequest",
        seo_object_request: "_onSeoObjectRequest",
      },
    ),
    start: function () {
      if (!this.$(".js_change_lang").length) {
        var $links = this.$("ul.js_language_selector li a:not([data-oe-id])");
        var m = $(
          _.min($links, function (l) {
            return $(l).attr("href").length;
          }),
        ).attr("href");
        $links.each(function () {
          var $link = $(this);
          var t = $link.attr("href");
          var l = t === m ? "default" : t.split("/")[1];
          $link.data("lang", l).addClass("js_change_lang");
        });
      }
      this.$(".zoomable img[data-zoom]").zoomOdoo();
      return this._super.apply(this, arguments);
    },
    _getContext: function (context) {
      var html = document.documentElement;
      return _.extend(
        { website_id: html.getAttribute("data-website-id") | 0 },
        this._super.apply(this, arguments),
      );
    },
    _getExtraContext: function (context) {
      var html = document.documentElement;
      return _.extend(
        {
          editable: !!(html.dataset.editable || $("[data-oe-model]").length),
          translatable: !!html.dataset.translatable,
          edit_translations: !!html.dataset.edit_translations,
        },
        this._super.apply(this, arguments),
      );
    },
    _getPublicWidgetsRegistry: function (options) {
      var registry = this._super.apply(this, arguments);
      if (options.editableMode) {
        return _.pick(registry, function (PublicWidget) {
          return !PublicWidget.prototype.disabledInEditableMode;
        });
      }
      return registry;
    },
    _onWidgetsStartRequest: function (ev) {
      ev.data.options = _.clone(ev.data.options || {});
      ev.data.options.editableMode = ev.data.editableMode;
      this._super.apply(this, arguments);
    },
    _onLangChangeClick: function (ev) {
      ev.preventDefault();
      var $target = $(ev.currentTarget);
      var redirect = {
        lang: $target.data("url_code"),
        url: encodeURIComponent(
          $target.attr("href").replace(/[&?]edit_translations[^&?]+/, ""),
        ),
        hash: encodeURIComponent(window.location.hash),
      };
      window.location.href = _.str.sprintf(
        "/website/lang/%(lang)s?r=%(url)s%(hash)s",
        redirect,
      );
    },
    _onSeoObjectRequest: function (ev) {
      var res = this._unslugHtmlDataObject("seo-object");
      ev.data.callback(res);
    },
    _unslugHtmlDataObject: function (dataAttr) {
      var repr = $("html").data(dataAttr);
      var match = repr && repr.match(/(.+)\((\d+),(.*)\)/);
      if (!match) {
        return null;
      }
      return { model: match[1], id: match[2] | 0 };
    },
    _onPublishBtnClick: function (ev) {
      ev.preventDefault();
      var $data = $(ev.currentTarget).parents(".js_publish_management:first");
      this._rpc({
        route: $data.data("controller") || "/website/publish",
        params: { id: +$data.data("id"), object: $data.data("object") },
      }).then(function (result) {
        $data
          .toggleClass("css_published", result)
          .toggleClass("css_unpublished", !result);
        $data.find("input").prop("checked", result);
        $data
          .parents("[data-publish]")
          .attr("data-publish", +result ? "on" : "off");
      });
    },
    _onWebsiteSwitch: function (ev) {
      var websiteId = ev.currentTarget.getAttribute("website-id");
      var websiteDomain = ev.currentTarget.getAttribute("domain");
      let url = `/website/force/${websiteId}`;
      if (websiteDomain && window.location.hostname !== websiteDomain) {
        url = websiteDomain + url;
      }
      const path =
        window.location.pathname +
        window.location.search +
        window.location.hash;
      window.location.href = $.param.querystring(url, { path: path });
    },
    _onModalShown: function (ev) {
      $(ev.target).addClass("modal_shown");
    },
  });
  return { WebsiteRoot: WebsiteRoot, websiteRootRegistry: websiteRootRegistry };
});

/* /website/static/src/js/content/compatibility.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.content.compatibility", function (require) {
  "use strict";
  require("web.dom_ready");
  var browser = _.findKey($.browser, function (v) {
    return v === true;
  });
  if (
    $.browser.mozilla &&
    +$.browser.version.replace(/^([0-9]+\.[0-9]+).*/, "\$1") < 20
  ) {
    browser = "msie";
  }
  browser += "," + $.browser.version;
  var mobileRegex =
    /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  if (mobileRegex.test(window.navigator.userAgent.toLowerCase())) {
    browser += ",mobile";
  }
  document.documentElement.setAttribute("data-browser", browser);
  var htmlStyle = document.documentElement.style;
  var isFlexSupported =
    "flexWrap" in htmlStyle ||
    "WebkitFlexWrap" in htmlStyle ||
    "msFlexWrap" in htmlStyle;
  if (!isFlexSupported) {
    document.documentElement.setAttribute("data-no-flex", "");
  }
  return { browser: browser, isFlexSupported: isFlexSupported };
});

/* /website/static/src/js/content/lazy_template_call.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.content.lazy_template_call", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.LazyTemplateRenderer = publicWidget.Widget.extend({
    selector: "#wrapwrap:has([data-oe-call])",
    start: function () {
      var def = this._super.apply(this, arguments);
      var $oeCalls = this.$("[data-oe-call]");
      var oeCalls = _.uniq(
        $oeCalls
          .map(function () {
            return $(this).data("oe-call");
          })
          .get(),
      );
      if (!oeCalls.length) {
        return def;
      }
      var renderDef = this._rpc({
        route: "/website/multi_render",
        params: { ids_or_xml_ids: oeCalls },
      }).then(function (data) {
        _.each(data, function (d, k) {
          var $data = $(d).addClass("o_block_" + k);
          $oeCalls.filter('[data-oe-call="' + k + '"]').each(function () {
            $(this).replaceWith($data.clone());
          });
        });
      });
      return Promise.all([def, renderDef]);
    },
  });
});

/* /website/static/src/js/content/menu.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.content.menu", function (require) {
  "use strict";
  var dom = require("web.dom");
  var publicWidget = require("web.public.widget");
  var wUtils = require("website.utils");
  publicWidget.registry.affixMenu = publicWidget.Widget.extend({
    selector: "header.o_affix_enabled",
    start: function () {
      var def = this._super.apply(this, arguments);
      var self = this;
      this.$headerClone = this.$target
        .clone()
        .addClass("o_header_affix affix")
        .removeClass("o_affix_enabled")
        .removeAttr("id");
      this.$headerClone.insertAfter(this.$target);
      this.$headers = this.$target.add(this.$headerClone);
      this.$dropdowns = this.$headers.find(".dropdown");
      this.$dropdownMenus = this.$headers.find(".dropdown-menu");
      this.$navbarCollapses = this.$headers.find(".navbar-collapse");
      this._adaptDefaultOffset();
      wUtils.onceAllImagesLoaded(this.$headerClone).then(function () {
        self._adaptDefaultOffset();
      });
      _.each(this.$headerClone.find('[data-toggle="collapse"]'), function (el) {
        var $source = $(el);
        var targetIDSelector = $source.attr("data-target");
        var $target = self.$headerClone.find(targetIDSelector);
        $source.attr("data-target", targetIDSelector + "_clone");
        $target.attr("id", targetIDSelector.substr(1) + "_clone");
      });
      this.$headerClone
        .find("div.navbar-collapse")
        .on("show.bs.collapse", function () {
          $(document.body).addClass("overflow-hidden");
        })
        .on("hide.bs.collapse", function () {
          $(document.body).removeClass("overflow-hidden");
        });
      $(window).on(
        "resize.affixMenu scroll.affixMenu",
        _.throttle(this._onWindowUpdate.bind(this), 200),
      );
      setTimeout(this._onWindowUpdate.bind(this), 0);
      return def.then(function () {
        self.trigger_up("widgets_start_request", {
          $target: self.$headerClone,
        });
      });
    },
    destroy: function () {
      if (this.$headerClone) {
        this.$headerClone.remove();
        $(window).off(".affixMenu");
      }
      this._super.apply(this, arguments);
    },
    _adaptDefaultOffset: function () {
      var bottom = this.$target.offset().top + this._getHeaderHeight();
      this.$headerClone.css("margin-top", Math.min(-200, -bottom) + "px");
    },
    _getHeaderHeight: function () {
      return this.$headerClone.outerHeight();
    },
    _onWindowUpdate: function () {
      if (this.$navbarCollapses.hasClass("show")) {
        return;
      }
      var wOffset = $(window).scrollTop();
      var hOffset = this.$target.scrollTop();
      this.$headerClone.toggleClass("affixed", wOffset > hOffset + 300);
      this.$dropdowns.add(this.$dropdownMenus).removeClass("show");
      this.$navbarCollapses.removeClass("show").attr("aria-expanded", false);
    },
  });
  publicWidget.registry.autohideMenu = publicWidget.Widget.extend({
    selector: "header #top_menu",
    start: function () {
      var self = this;
      var defs = [this._super.apply(this, arguments)];
      this.noAutohide = this.$el.closest(".o_no_autohide_menu").length;
      if (!this.noAutohide) {
        var $navbar = this.$el.closest(".navbar");
        defs.push(wUtils.onceAllImagesLoaded($navbar));
        var $window = $(window);
        $window.on("load.autohideMenu", function () {
          $window.trigger("resize");
        });
      }
      return Promise.all(defs).then(function () {
        if (!self.noAutohide) {
          dom.initAutoMoreMenu(self.$el, {
            unfoldable: ".divider, .divider ~ li",
          });
        }
        self.$el.removeClass("o_menu_loading");
      });
    },
    destroy: function () {
      this._super.apply(this, arguments);
      if (!this.noAutohide) {
        $(window).off(".autohideMenu");
        dom.destroyAutoMoreMenu(this.$el);
      }
    },
  });
  publicWidget.registry.menuDirection = publicWidget.Widget.extend({
    selector: "header .navbar .nav",
    events: { "show.bs.dropdown": "_onDropdownShow" },
    start: function () {
      this.defaultAlignment = this.$el.is(".ml-auto, .ml-auto ~ *")
        ? "right"
        : "left";
      return this._super.apply(this, arguments);
    },
    _checkOpening: function (
      alignment,
      liOffset,
      liWidth,
      menuWidth,
      windowWidth,
    ) {
      if (alignment === "left") {
        return liOffset + menuWidth <= windowWidth;
      } else {
        return liOffset + liWidth - menuWidth >= 0;
      }
    },
    _onDropdownShow: function (ev) {
      var $li = $(ev.target);
      var $menu = $li.children(".dropdown-menu");
      var liOffset = $li.offset().left;
      var liWidth = $li.outerWidth();
      var menuWidth = $menu.outerWidth();
      var windowWidth = $(window).outerWidth();
      $menu.removeClass("dropdown-menu-left dropdown-menu-right");
      var alignment = this.defaultAlignment;
      if ($li.nextAll(":visible").length === 0) {
        alignment = "right";
      }
      for (var i = 0; i < 2; i++) {
        if (
          !this._checkOpening(
            alignment,
            liOffset,
            liWidth,
            menuWidth,
            windowWidth,
          )
        ) {
          alignment = alignment === "left" ? "right" : "left";
        }
      }
      $menu.addClass("dropdown-menu-" + alignment);
    },
  });
});

/* /website/static/src/js/content/snippets.animation.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.content.snippets.animation", function (require) {
  "use strict";
  const ajax = require("web.ajax");
  var Class = require("web.Class");
  var config = require("web.config");
  var core = require("web.core");
  var mixins = require("web.mixins");
  var publicWidget = require("web.public.widget");
  var utils = require("web.utils");
  var qweb = core.qweb;
  window.requestAnimationFrame =
    window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    window.oRequestAnimationFrame;
  window.cancelAnimationFrame =
    window.cancelAnimationFrame ||
    window.webkitCancelAnimationFrame ||
    window.mozCancelAnimationFrame ||
    window.msCancelAnimationFrame ||
    window.oCancelAnimationFrame;
  if (!window.performance || !window.performance.now) {
    window.performance = {
      now: function () {
        return Date.now();
      },
    };
  }
  publicWidget.Widget.include({
    disabledInEditableMode: true,
    edit_events: null,
    read_events: null,
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.editableMode = this.options.editableMode || false;
      var extraEvents = this.editableMode ? this.edit_events : this.read_events;
      if (extraEvents) {
        this.events = _.extend({}, this.events || {}, extraEvents);
      }
    },
  });
  var AnimationEffect = Class.extend(mixins.ParentedMixin, {
    init: function (
      parent,
      updateCallback,
      startEvents,
      $startTarget,
      options,
    ) {
      mixins.ParentedMixin.init.call(this);
      this.setParent(parent);
      options = options || {};
      this._minFrameTime = 1000 / (options.maxFPS || 100);
      this._updateCallback = updateCallback;
      this.startEvents = startEvents || "scroll";
      this.$startTarget = $($startTarget || window);
      if (options.getStateCallback) {
        this._getStateCallback = options.getStateCallback;
      } else if (
        this.startEvents === "scroll" &&
        this.$startTarget[0] === window
      ) {
        this._getStateCallback = function () {
          return window.pageYOffset;
        };
      } else if (
        this.startEvents === "resize" &&
        this.$startTarget[0] === window
      ) {
        this._getStateCallback = function () {
          return { width: window.innerWidth, height: window.innerHeight };
        };
      } else {
        this._getStateCallback = function () {
          return undefined;
        };
      }
      this.endEvents = options.endEvents || false;
      this.$endTarget = options.$endTarget
        ? $(options.$endTarget)
        : this.$startTarget;
      this._updateCallback = this._updateCallback.bind(parent);
      this._getStateCallback = this._getStateCallback.bind(parent);
      this._uid = "_animationEffect" + _.uniqueId();
      this.startEvents = _processEvents(this.startEvents, this._uid);
      if (this.endEvents) {
        this.endEvents = _processEvents(this.endEvents, this._uid);
      }
      function _processEvents(events, namespace) {
        events = events.split(" ");
        return _.each(events, function (e, index) {
          events[index] += "." + namespace;
        }).join(" ");
      }
    },
    destroy: function () {
      mixins.ParentedMixin.destroy.call(this);
      this.stop();
    },
    start: function () {
      this._paused = false;
      this._rafID = window.requestAnimationFrame(
        function (t) {
          this._update(t);
          this._paused = true;
        }.bind(this),
      );
      if (this.endEvents) {
        this.$startTarget.on(
          this.startEvents,
          function (e) {
            if (this._paused) {
              _.defer(this.play.bind(this, e));
            }
          }.bind(this),
        );
        this.$endTarget.on(
          this.endEvents,
          function () {
            if (!this._paused) {
              _.defer(this.pause.bind(this));
            }
          }.bind(this),
        );
      } else {
        var pauseTimer = null;
        this.$startTarget.on(
          this.startEvents,
          _.throttle(
            function (e) {
              this.play(e);
              clearTimeout(pauseTimer);
              pauseTimer = _.delay(
                function () {
                  this.pause();
                  pauseTimer = null;
                }.bind(this),
                2000,
              );
            }.bind(this),
            250,
            { trailing: false },
          ),
        );
      }
    },
    stop: function () {
      this.$startTarget.off(this.startEvents);
      if (this.endEvents) {
        this.$endTarget.off(this.endEvents);
      }
      this.pause();
    },
    play: function (e) {
      this._newEvent = e;
      if (!this._paused) {
        return;
      }
      this._paused = false;
      this._rafID = window.requestAnimationFrame(this._update.bind(this));
      this._lastUpdateTimestamp = undefined;
    },
    pause: function () {
      if (this._paused) {
        return;
      }
      this._paused = true;
      window.cancelAnimationFrame(this._rafID);
      this._lastUpdateTimestamp = undefined;
    },
    _update: function (timestamp) {
      if (this._paused) {
        return;
      }
      this._rafID = window.requestAnimationFrame(this._update.bind(this));
      var elapsedTime = 0;
      if (this._lastUpdateTimestamp) {
        elapsedTime = timestamp - this._lastUpdateTimestamp;
        if (elapsedTime < this._minFrameTime) {
          return;
        }
      }
      var animationState = this._getStateCallback(elapsedTime, this._newEvent);
      if (
        !this._newEvent &&
        animationState !== undefined &&
        _.isEqual(animationState, this._animationLastState)
      ) {
        return;
      }
      this._animationLastState = animationState;
      this._updateCallback(
        this._animationLastState,
        elapsedTime,
        this._newEvent,
      );
      this._lastUpdateTimestamp = timestamp;
      this._newEvent = undefined;
    },
  });
  var Animation = publicWidget.Widget.extend({
    maxFPS: 100,
    effects: [],
    start: function () {
      this._prepareEffects();
      _.each(this._animationEffects, function (effect) {
        effect.start();
      });
      return this._super.apply(this, arguments);
    },
    _prepareEffects: function () {
      this._animationEffects = [];
      var self = this;
      _.each(this.effects, function (desc) {
        self._addEffect(
          self[desc.update],
          desc.startEvents,
          _findTarget(desc.startTarget),
          {
            getStateCallback: desc.getState && self[desc.getState],
            endEvents: desc.endEvents || undefined,
            $endTarget: _findTarget(desc.endTarget),
            maxFPS: self.maxFPS,
          },
        );
        function _findTarget(selector) {
          if (selector) {
            if (selector === "selector") {
              return self.$target;
            }
            return self.$(selector);
          }
          return undefined;
        }
      });
    },
    _addEffect: function (updateCallback, startEvents, $startTarget, options) {
      this._animationEffects.push(
        new AnimationEffect(
          this,
          updateCallback,
          startEvents,
          $startTarget,
          options,
        ),
      );
    },
  });
  var registry = publicWidget.registry;
  registry.slider = publicWidget.Widget.extend({
    selector: ".carousel",
    disabledInEditableMode: false,
    edit_events: { "slid.bs.carousel": "_onEditionSlide" },
    start: function () {
      if (!this.editableMode) {
        this.$("img").on("load.slider", this._onImageLoaded.bind(this));
        this._computeHeights();
      }
      this.$target.carousel();
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      this.$("img").off(".slider");
      this.$target.carousel("pause");
      this.$target.removeData("bs.carousel");
      _.each(this.$(".carousel-item"), function (el) {
        $(el).css("min-height", "");
      });
    },
    _computeHeights: function () {
      var maxHeight = 0;
      var $items = this.$(".carousel-item");
      _.each($items, function (el) {
        var $item = $(el);
        var isActive = $item.hasClass("active");
        $item.addClass("active");
        var height = $item.outerHeight();
        if (height > maxHeight) {
          maxHeight = height;
        }
        $item.toggleClass("active", isActive);
      });
      _.each($items, function (el) {
        $(el).css("min-height", maxHeight);
      });
    },
    _onEditionSlide: function () {
      this._computeHeights();
    },
    _onImageLoaded: function () {
      this._computeHeights();
    },
  });
  registry.parallax = Animation.extend({
    selector: ".parallax",
    disabledInEditableMode: false,
    effects: [{ startEvents: "scroll", update: "_onWindowScroll" }],
    start: function () {
      this._rebuild();
      $(window).on(
        "resize.animation_parallax",
        _.debounce(this._rebuild.bind(this), 500),
      );
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      $(window).off(".animation_parallax");
    },
    _rebuild: function () {
      if (!this.$bg || !this.$bg.length) {
        this.$bg = this.$("> .s_parallax_bg");
        if (!this.$bg.length) {
          this.$bg = $("<span/>", {
            class:
              "s_parallax_bg" +
              (this.$target.hasClass("oe_custom_bg") ? " oe_custom_bg" : ""),
          }).prependTo(this.$target);
        }
      }
      var urlTarget = this.$target.css("background-image");
      if (urlTarget !== "none") {
        this.$bg.css("background-image", urlTarget);
      }
      this.$target.css("background-image", "none");
      this.speed = parseFloat(
        this.$target.attr("data-scroll-background-ratio") || 0,
      );
      this.$target.toggleClass("s_parallax_is_fixed", this.speed === 1);
      var noParallaxSpeed = this.speed === 0 || this.speed === 1;
      this.$target.toggleClass(
        "s_parallax_no_overflow_hidden",
        noParallaxSpeed,
      );
      if (noParallaxSpeed) {
        this.$bg.css({ transform: "", top: "", bottom: "" });
        return;
      }
      this.viewport =
        document.body.clientHeight - $("#wrapwrap").position().top;
      this.visibleArea = [this.$target.offset().top];
      this.visibleArea.push(
        this.visibleArea[0] + this.$target.innerHeight() + this.viewport,
      );
      this.ratio = this.speed * (this.viewport / 10);
      this.$bg.css({ top: -this.ratio, bottom: -this.ratio });
    },
    _onWindowScroll: function (scrollOffset) {
      if (this.speed === 0 || this.speed === 1) {
        return;
      }
      var vpEndOffset = scrollOffset + this.viewport;
      if (
        vpEndOffset >= this.visibleArea[0] &&
        vpEndOffset <= this.visibleArea[1]
      ) {
        this.$bg.css(
          "transform",
          "translateY(" +
            _getNormalizedPosition.call(this, vpEndOffset) +
            "px)",
        );
      }
      function _getNormalizedPosition(pos) {
        var r =
          (pos - this.visibleArea[1]) /
          (this.visibleArea[0] - this.visibleArea[1]);
        return Math.round(this.ratio * (2 * r - 1));
      }
    },
  });
  registry.share = publicWidget.Widget.extend({
    selector: ".s_share, .oe_share",
    start: function () {
      var urlRegex = /(\?(?:|.*&)(?:u|url|body)=)(.*?)(&|#|$)/;
      var titleRegex = /(\?(?:|.*&)(?:title|text|subject)=)(.*?)(&|#|$)/;
      var url = encodeURIComponent(window.location.href);
      var title = encodeURIComponent($("title").text());
      this.$("a").each(function () {
        var $a = $(this);
        $a.attr("href", function (i, href) {
          return href
            .replace(urlRegex, function (match, a, b, c) {
              return a + url + c;
            })
            .replace(titleRegex, function (match, a, b, c) {
              return a + title + c;
            });
        });
        if (
          $a.attr("target") &&
          $a.attr("target").match(/_blank/i) &&
          !$a.closest(".o_editable").length
        ) {
          $a.on("click", function () {
            window.open(
              this.href,
              "",
              "menubar=no,toolbar=no,resizable=yes,scrollbars=yes,height=550,width=600",
            );
            return false;
          });
        }
      });
      return this._super.apply(this, arguments);
    },
  });
  const MobileYoutubeAutoplayMixin = {
    _setupAutoplay: function (src) {
      let promise = Promise.resolve();
      this.isYoutubeVideo = src.indexOf("youtube") >= 0;
      this.isMobileEnv =
        config.device.size_class <= config.device.SIZES.LG &&
        config.device.touch;
      if (this.isYoutubeVideo && this.isMobileEnv && !window.YT) {
        const oldOnYoutubeIframeAPIReady = window.onYouTubeIframeAPIReady;
        promise = new Promise((resolve) => {
          window.onYouTubeIframeAPIReady = () => {
            if (oldOnYoutubeIframeAPIReady) {
              oldOnYoutubeIframeAPIReady();
            }
            return resolve();
          };
        });
        ajax.loadJS("https://www.youtube.com/iframe_api");
      }
      return promise;
    },
    _triggerAutoplay: function (iframeEl) {
      if (this.isMobileEnv && this.isYoutubeVideo) {
        new window.YT.Player(iframeEl, {
          events: { onReady: (ev) => ev.target.playVideo() },
        });
      }
    },
  };
  registry.mediaVideo = publicWidget.Widget.extend(MobileYoutubeAutoplayMixin, {
    selector: ".media_iframe_video",
    start: function () {
      const proms = [this._super.apply(this, arguments)];
      let iframeEl = this.$target[0].querySelector(":scope > iframe");
      if (!iframeEl) {
        iframeEl = this._generateIframe();
      }
      if (!iframeEl) {
        return Promise.all(proms);
      }
      proms.push(this._setupAutoplay(iframeEl.getAttribute("src")));
      return Promise.all(proms).then(() => {
        this._triggerAutoplay(iframeEl);
      });
    },
    _generateIframe: function () {
      this.$target.empty();
      this.$target.append(
        '<div class="css_editable_mode_display">&nbsp;</div>' +
          '<div class="media_iframe_video_size">&nbsp;</div>',
      );
      var src = _.escape(
        this.$target.data("oe-expression") || this.$target.data("src"),
      );
      var m = src.match(/^(?:https?:)?\/\/([^/?#]+)/);
      if (!m) {
        return;
      }
      var domain = m[1].replace(/^www\./, "");
      var supportedDomains = [
        "youtu.be",
        "youtube.com",
        "youtube-nocookie.com",
        "instagram.com",
        "vine.co",
        "player.vimeo.com",
        "vimeo.com",
        "dailymotion.com",
        "player.youku.com",
        "youku.com",
      ];
      if (!_.contains(supportedDomains, domain)) {
        return;
      }
      const iframeEl = $("<iframe/>", {
        src: src,
        frameborder: "0",
        allowfullscreen: "allowfullscreen",
      })[0];
      this.$target.append(iframeEl);
      return iframeEl;
    },
  });
  registry.backgroundVideo = publicWidget.Widget.extend(
    MobileYoutubeAutoplayMixin,
    {
      selector: ".o_background_video",
      xmlDependencies: ["/website/static/src/xml/website.background.video.xml"],
      disabledInEditableMode: false,
      start: function () {
        var proms = [this._super(...arguments)];
        this.videoSrc = this.el.dataset.bgVideoSrc;
        this.iframeID = _.uniqueId("o_bg_video_iframe_");
        proms.push(this._setupAutoplay(this.videoSrc));
        if (
          this.isYoutubeVideo &&
          this.isMobileEnv &&
          !this.videoSrc.includes("enablejsapi=1")
        ) {
          this.videoSrc += "&enablejsapi=1";
        }
        var throttledUpdate = _.throttle(() => this._adjustIframe(), 50);
        var $dropdownMenu = this.$el.closest(".dropdown-menu");
        if ($dropdownMenu.length) {
          this.$dropdownParent = $dropdownMenu.parent();
          this.$dropdownParent.on(
            "shown.bs.dropdown.backgroundVideo",
            throttledUpdate,
          );
        }
        $(window).on("resize." + this.iframeID, throttledUpdate);
        return Promise.all(proms).then(() => this._appendBgVideo());
      },
      destroy: function () {
        this._super.apply(this, arguments);
        if (this.$dropdownParent) {
          this.$dropdownParent.off(".backgroundVideo");
        }
        $(window).off("resize." + this.iframeID);
        if (this.$bgVideoContainer) {
          this.$bgVideoContainer.remove();
        }
      },
      _adjustIframe: function () {
        if (!this.$iframe) {
          return;
        }
        this.$iframe.removeClass("show");
        var wrapperWidth = this.$target.innerWidth();
        var wrapperHeight = this.$target.innerHeight();
        var relativeRatio = wrapperWidth / wrapperHeight / (16 / 9);
        var style = {};
        if (relativeRatio >= 1.0) {
          style["width"] = "100%";
          style["height"] = relativeRatio * 100 + "%";
          style["left"] = "0";
          style["top"] = (-(relativeRatio - 1.0) / 2) * 100 + "%";
        } else {
          style["width"] = (1 / relativeRatio) * 100 + "%";
          style["height"] = "100%";
          style["left"] = (-(1 / relativeRatio - 1.0) / 2) * 100 + "%";
          style["top"] = "0";
        }
        this.$iframe.css(style);
        void this.$iframe[0].offsetWidth;
        this.$iframe.addClass("show");
      },
      _appendBgVideo: function () {
        var $oldContainer =
          this.$bgVideoContainer || this.$("> .o_bg_video_container");
        this.$bgVideoContainer = $(
          qweb.render("website.background.video", {
            videoSrc: this.videoSrc,
            iframeID: this.iframeID,
          }),
        );
        this.$iframe = this.$bgVideoContainer.find(".o_bg_video_iframe");
        this.$iframe.one("load", () => {
          this.$bgVideoContainer.find(".o_bg_video_loading").remove();
        });
        this.$bgVideoContainer.prependTo(this.$target);
        $oldContainer.remove();
        this._adjustIframe();
        this._triggerAutoplay(this.$iframe[0]);
      },
    },
  );
  registry.ul = publicWidget.Widget.extend({
    selector: "ul.o_ul_folded, ol.o_ul_folded",
    events: {
      "click .o_ul_toggle_next": "_onToggleNextClick",
      "click .o_ul_toggle_self": "_onToggleSelfClick",
    },
    _onToggleNextClick: function (ev) {
      ev.preventDefault();
      var $target = $(ev.currentTarget);
      $target.toggleClass("o_open");
      $target.closest("li").next().toggleClass("o_close");
    },
    _onToggleSelfClick: function (ev) {
      ev.preventDefault();
      var $target = $(ev.currentTarget);
      $target.toggleClass("o_open");
      $target.closest("li").find("ul,ol").toggleClass("o_close");
    },
  });
  registry.gallery = publicWidget.Widget.extend({
    selector: ".o_gallery:not(.o_slideshow)",
    xmlDependencies: ["/website/static/src/xml/website.gallery.xml"],
    events: { "click img": "_onClickImg" },
    _onClickImg: function (ev) {
      var self = this;
      var $cur = $(ev.currentTarget);
      var urls = [];
      var idx = undefined;
      var milliseconds = undefined;
      var params = undefined;
      var $images = $cur.closest(".o_gallery").find("img");
      var size = 0.8;
      var dimensions = {
        min_width: Math.round(window.innerWidth * size * 0.9),
        min_height: Math.round(window.innerHeight * size),
        max_width: Math.round(window.innerWidth * size * 0.9),
        max_height: Math.round(window.innerHeight * size),
        width: Math.round(window.innerWidth * size * 0.9),
        height: Math.round(window.innerHeight * size),
      };
      $images.each(function () {
        urls.push($(this).attr("src"));
      });
      var $img = $cur.is("img") === true ? $cur : $cur.closest("img");
      idx = urls.indexOf($img.attr("src"));
      milliseconds = $cur.closest(".o_gallery").data("interval") || false;
      var $modal = $(
        qweb.render("website.gallery.slideshow.lightbox", {
          srcs: urls,
          index: idx,
          dim: dimensions,
          interval: milliseconds,
          id: _.uniqueId("slideshow_"),
        }),
      );
      $modal.modal({ keyboard: true, backdrop: true });
      $modal.on("hidden.bs.modal", function () {
        $(this).hide();
        $(this).siblings().filter(".modal-backdrop").remove();
        $(this).remove();
      });
      $modal
        .find(".modal-content, .modal-body.o_slideshow")
        .css("height", "100%");
      $modal.appendTo(document.body);
      $modal.one("shown.bs.modal", function () {
        self.trigger_up("widgets_start_request", {
          editableMode: false,
          $target: $modal.find(".modal-body.o_slideshow"),
        });
      });
    },
  });
  registry.gallerySlider = publicWidget.Widget.extend({
    selector: ".o_slideshow",
    xmlDependencies: ["/website/static/src/xml/website.gallery.xml"],
    disabledInEditableMode: false,
    start: function () {
      var self = this;
      this.$carousel = this.$target.is(".carousel")
        ? this.$target
        : this.$target.find(".carousel");
      this.$indicator = this.$carousel.find(".carousel-indicators");
      this.$prev = this.$indicator
        .find("li.o_indicators_left")
        .css("visibility", "");
      this.$next = this.$indicator
        .find("li.o_indicators_right")
        .css("visibility", "");
      var $lis = this.$indicator.find("li[data-slide-to]");
      var nbPerPage =
        Math.floor(this.$indicator.width() / $lis.first().outerWidth(true)) - 3;
      var realNbPerPage = nbPerPage || 1;
      var nbPages = Math.ceil($lis.length / realNbPerPage);
      var index;
      var page;
      update();
      function hide() {
        $lis.each(function (i) {
          $(this).toggleClass(
            "d-none",
            i < page * nbPerPage || i >= (page + 1) * nbPerPage,
          );
        });
        if (self.editableMode) {
          return;
        }
        if (page <= 0) {
          self.$prev.detach();
        } else {
          self.$prev.prependTo(self.$indicator);
        }
        if (page >= nbPages - 1) {
          self.$next.detach();
        } else {
          self.$next.appendTo(self.$indicator);
        }
      }
      function update() {
        const active = $lis.filter(".active");
        index = active.length ? $lis.index(active) : 0;
        page = Math.floor(index / realNbPerPage);
        hide();
      }
      this.$carousel.on("slide.bs.carousel.gallery_slider", function () {
        setTimeout(function () {
          var $item = self.$carousel.find(
            ".carousel-inner .carousel-item-prev, .carousel-inner .carousel-item-next",
          );
          var index = $item.index();
          $lis
            .removeClass("active")
            .filter('[data-slide-to="' + index + '"]')
            .addClass("active");
        }, 0);
      });
      this.$indicator.on(
        "click.gallery_slider",
        "> li:not([data-slide-to])",
        function () {
          page += $(this).hasClass("o_indicators_left") ? -1 : 1;
          page = Math.max(0, Math.min(nbPages - 1, page));
          self.$carousel.carousel(page * realNbPerPage);
          hide();
        },
      );
      this.$carousel.on("slid.bs.carousel.gallery_slider", update);
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      if (!this.$indicator) {
        return;
      }
      this.$prev.prependTo(this.$indicator);
      this.$next.appendTo(this.$indicator);
      this.$carousel.off(".gallery_slider");
      this.$indicator.off(".gallery_slider");
    },
  });
  registry.socialShare = publicWidget.Widget.extend({
    selector: ".oe_social_share",
    xmlDependencies: ["/website/static/src/xml/website.share.xml"],
    events: { mouseenter: "_onMouseEnter" },
    _bindSocialEvent: function () {
      this.$(".oe_social_facebook").click(
        $.proxy(this._renderSocial, this, "facebook"),
      );
      this.$(".oe_social_twitter").click(
        $.proxy(this._renderSocial, this, "twitter"),
      );
      this.$(".oe_social_linkedin").click(
        $.proxy(this._renderSocial, this, "linkedin"),
      );
    },
    _render: function () {
      this.$el
        .popover({
          content: qweb.render("website.social_hover", {
            medias: this.socialList,
          }),
          placement: "bottom",
          container: this.$el,
          html: true,
          trigger: "manual",
          animation: false,
        })
        .popover("show");
      this.$el
        .off("mouseleave.socialShare")
        .on("mouseleave.socialShare", function () {
          var self = this;
          setTimeout(function () {
            if (!$(".popover:hover").length) {
              $(self).popover("dispose");
            }
          }, 200);
        });
    },
    _renderSocial: function (social) {
      var url = this.$el.data("urlshare") || document.URL.split(/[?#]/)[0];
      url = encodeURIComponent(url);
      var title = document.title.split(" | ")[0];
      var hashtags =
        " #" +
        document.title.split(" | ")[1].replace(" ", "") +
        " " +
        this.hashtags;
      var socialNetworks = {
        facebook: "https://www.facebook.com/sharer/sharer.php?u=" + url,
        twitter:
          "https://twitter.com/intent/tweet?original_referer=" +
          url +
          "&text=" +
          encodeURIComponent(title + hashtags + " - ") +
          url,
        linkedin:
          "https://www.linkedin.com/shareArticle?mini=true&url=" +
          url +
          "&title=" +
          encodeURIComponent(title),
      };
      if (!_.contains(_.keys(socialNetworks), social)) {
        return;
      }
      var wHeight = 500;
      var wWidth = 500;
      window.open(
        socialNetworks[social],
        "",
        "menubar=no, toolbar=no, resizable=yes, scrollbar=yes, height=" +
          wHeight +
          ",width=" +
          wWidth,
      );
    },
    _onMouseEnter: function () {
      var social = this.$el.data("social");
      this.socialList = social
        ? social.split(",")
        : ["facebook", "twitter", "linkedin"];
      this.hashtags = this.$el.data("hashtags") || "";
      this._render();
      this._bindSocialEvent();
    },
  });
  registry.facebookPage = publicWidget.Widget.extend({
    selector: ".o_facebook_page",
    disabledInEditableMode: false,
    start: function () {
      var def = this._super.apply(this, arguments);
      var params = _.pick(
        this.$el.data(),
        "href",
        "height",
        "tabs",
        "small_header",
        "hide_cover",
        "show_facepile",
      );
      if (!params.href) {
        return def;
      }
      params.width = utils.confine(Math.floor(this.$el.width()), 180, 500);
      var src = $.param.querystring(
        "https://www.facebook.com/plugins/page.php",
        params,
      );
      this.$iframe = $("<iframe/>", {
        src: src,
        class: "o_temp_auto_element",
        width: params.width,
        height: params.height,
        css: { border: "none", overflow: "hidden" },
        scrolling: "no",
        frameborder: "0",
        allowTransparency: "true",
      });
      this.$el.append(this.$iframe);
      return def;
    },
    destroy: function () {
      this._super.apply(this, arguments);
      if (this.$iframe) {
        this.$iframe.remove();
      }
    },
  });
  registry.anchorSlide = publicWidget.Widget.extend({
    selector: 'a[href^="/"][href*="#"], a[href^="#"]',
    events: { click: "_onAnimateClick" },
    _onAnimateClick: function (ev) {
      if (this.$target[0].pathname !== window.location.pathname) {
        return;
      }
      var hash = this.$target[0].hash;
      if (!utils.isValidAnchor(hash)) {
        return;
      }
      var $anchor = $(hash);
      if (!$anchor.length || !$anchor.attr("data-anchor")) {
        return;
      }
      ev.preventDefault();
      $("html, body").animate({ scrollTop: $anchor.offset().top }, 500);
    },
  });
  return {
    Widget: publicWidget.Widget,
    Animation: Animation,
    registry: registry,
    Class: Animation,
  };
});

/* /website/static/src/js/menu/navbar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.navbar", function (require) {
  "use strict";
  var core = require("web.core");
  var dom = require("web.dom");
  var publicWidget = require("web.public.widget");
  var concurrency = require("web.concurrency");
  var Widget = require("web.Widget");
  var websiteRootData = require("website.root");
  var qweb = core.qweb;
  var websiteNavbarRegistry = new publicWidget.RootWidgetRegistry();
  var WebsiteNavbar = publicWidget.RootWidget.extend({
    xmlDependencies: ["/website/static/src/xml/website.xml"],
    events: _.extend({}, publicWidget.RootWidget.prototype.events || {}, {
      "click [data-action]": "_onActionMenuClick",
      "mouseover > ul > li.dropdown:not(.show)": "_onMenuHovered",
      "click .o_mobile_menu_toggle": "_onMobileMenuToggleClick",
      "mouseover #oe_applications:not(:has(.dropdown-item))":
        "_onOeApplicationsHovered",
    }),
    custom_events: _.extend(
      {},
      publicWidget.RootWidget.prototype.custom_events || {},
      {
        action_demand: "_onActionDemand",
        edit_mode: "_onEditMode",
        readonly_mode: "_onReadonlyMode",
        ready_to_save: "_onSave",
      },
    ),
    init: function () {
      this._super.apply(this, arguments);
      var self = this;
      var initPromise = new Promise(function (resolve) {
        self.resolveInit = resolve;
      });
      this._widgetDefs = [initPromise];
    },
    start: function () {
      var self = this;
      dom.initAutoMoreMenu(this.$("ul.o_menu_sections"), {
        maxWidth: function () {
          return (
            self.$el.width() -
            (self.$(".o_menu_systray").outerWidth(true) || 0) -
            (self.$("ul#oe_applications").outerWidth(true) || 0) -
            (self.$(".o_menu_toggle").outerWidth(true) || 0) -
            (self.$(".o_menu_brand").outerWidth(true) || 0)
          );
        },
      });
      return this._super.apply(this, arguments).then(function () {
        self.resolveInit();
      });
    },
    _attachComponent: function () {
      var def = this._super.apply(this, arguments);
      this._widgetDefs.push(def);
      return def;
    },
    _getRegistry: function () {
      return websiteNavbarRegistry;
    },
    _handleAction: function (actionName, params, _i) {
      var self = this;
      return this._whenReadyForActions().then(function () {
        var defs = [];
        _.each(self._widgets, function (w) {
          if (!w.handleAction) {
            return;
          }
          var def = w.handleAction(actionName, params);
          if (def !== null) {
            defs.push(def);
          }
        });
        if (!defs.length) {
          if (_i > 50) {
            console.warn(
              _.str.sprintf(
                "Action '%s' was not able to be handled.",
                actionName,
              ),
            );
            return Promise.reject();
          }
          return concurrency.delay(100).then(function () {
            return self._handleAction(actionName, params, (_i || 0) + 1);
          });
        }
        return Promise.all(defs).then(function (values) {
          if (values.length === 1) {
            return values[0];
          }
          return values;
        });
      });
    },
    _whenReadyForActions: function () {
      return Promise.all(this._widgetDefs);
    },
    _onOeApplicationsHovered: function (ev) {
      var self = this;
      this._rpc({
        model: "ir.ui.menu",
        method: "load_menus_root",
        args: [],
      }).then(function (result) {
        self.$("#oe_applications .dropdown-menu").html(
          $(
            qweb.render("website.oe_applications_menu", {
              menu_data: result,
            }),
          ),
        );
      });
    },
    _onActionMenuClick: function (ev) {
      var $button = $(ev.currentTarget);
      $button.prop("disabled", true);
      var always = function () {
        $button.prop("disabled", false);
      };
      this._handleAction($button.data("action"))
        .then(always)
        .guardedCatch(always);
    },
    _onActionDemand: function (ev) {
      var def = this._handleAction(ev.data.actionName, ev.data.params);
      if (ev.data.onSuccess) {
        def.then(ev.data.onSuccess);
      }
      if (ev.data.onFailure) {
        def.guardedCatch(ev.data.onFailure);
      }
    },
    _onEditMode: function () {
      this.$el.addClass("editing_mode");
      this.do_hide();
    },
    _onMenuHovered: function (ev) {
      var $opened = this.$("> ul > li.dropdown.show");
      if ($opened.length) {
        $opened.find(".dropdown-toggle").dropdown("toggle");
        $(ev.currentTarget).find(".dropdown-toggle").dropdown("toggle");
      }
    },
    _onMobileMenuToggleClick: function () {
      this.$el.parent().toggleClass("o_mobile_menu_opened");
    },
    _onReadonlyMode: function () {
      this.$el.removeClass("editing_mode");
      this.do_show();
    },
    _onSave: function (ev) {
      ev.data.defs.push(this._handleAction("on_save"));
    },
  });
  var WebsiteNavbarActionWidget = Widget.extend({
    actions: {},
    handleAction: function (actionName, params) {
      var action = this[this.actions[actionName]];
      if (action) {
        return Promise.resolve(action.apply(this, params || []));
      }
      return null;
    },
  });
  websiteRootData.websiteRootRegistry.add(
    WebsiteNavbar,
    "#oe_main_menu_navbar",
  );
  return {
    WebsiteNavbar: WebsiteNavbar,
    websiteNavbarRegistry: websiteNavbarRegistry,
    WebsiteNavbarActionWidget: WebsiteNavbarActionWidget,
  };
});

/* /website/static/src/js/visitor_timezone.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website.visitor_timezone", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var utils = require("web.utils");
  var publicWidget = require("web.public.widget");
  publicWidget.registry.visitorTimezone = publicWidget.Widget.extend({
    selector: "#wrapwrap",
    start: function () {
      if (!localStorage.getItem("website.found_visitor_timezone")) {
        var timezone = jstz.determine().name();
        this._rpc({
          route: "/website/update_visitor_timezone",
          params: { timezone: timezone },
        }).then(function (result) {
          if (result) {
            localStorage.setItem("website.found_visitor_timezone", true);
          }
        });
      }
      return this._super.apply(this, arguments);
    },
  });
  return publicWidget.registry.visitorTimezone;
});

/* /website/static/src/js/user_custom_javascript.js defined in bundle 'web.assets_frontend_lazy' */
/* /droggol_theme_common/static/src/js/website_sale.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.website_sale", function (require) {
  "use strict";
  require("website_sale.cart");
  var core = require("web.core");
  var qweb = core.qweb;
  var publicWidget = require("web.public.widget");
  var portalChatter = require("portal.chatter");
  var PortalChatter = portalChatter.PortalChatter;
  var wSaleUtils = require("website_sale.utils");
  PortalChatter.include({
    xmlDependencies: (PortalChatter.prototype.xmlDependencies || []).concat([
      "/droggol_theme_common/static/src/xml/portal_chatter.xml",
    ]),
  });
  publicWidget.registry.websiteSaleCartLink.include({
    selector: '#top_menu a[href$="/shop/cart"]:not(.dr_sale_cart_sidebar)',
  });
  publicWidget.registry.DrSaleCartSidebar = publicWidget.Widget.extend({
    selector: ".dr_sale_cart_sidebar",
    read_events: { click: "_onClick" },
    init: function () {
      this._super.apply(this, arguments);
      this.$backdrop = $('<div class="modal-backdrop show"/>');
    },
    _onClick: function (ev) {
      ev.preventDefault();
      var self = this;
      $.get("/shop/cart", { type: "dr_sale_cart_request" }).then(
        function (data) {
          var $data = $(data);
          $data.appendTo("body");
          $data.addClass("open", 500, "linear");
          self.$backdrop.appendTo("body");
          $("body").addClass("modal-open");
          self.trigger_up("widgets_start_request", {
            $target: $data,
            options: { $drCartBackdropEl: self.$backdrop },
          });
        },
      );
    },
  });
  publicWidget.registry.CartManger = publicWidget.Widget.extend({
    selector: ".dr_sale_cart_sidebar_container",
    read_events: {
      "click .dr_sale_cart_sidebar_close": "_removeSidebar",
      "click .d_remove_cart_line": "async _onRemoveLine",
    },
    init: function (parent, options) {
      this.$backdrop = options.$drCartBackdropEl;
      this.$backdrop.on("click", this._removeSidebar.bind(this));
      return this._super.apply(this, arguments);
    },
    _removeSidebar: function (ev) {
      ev.preventDefault();
      this.$backdrop.remove();
      this.$el.removeClass("open", 500, "linear", function () {
        $("body").removeClass("modal-open");
        $(".dr_sale_cart_sidebar_container").remove();
      });
    },
    _onRemoveLine: function (ev) {
      ev.preventDefault();
      var lineId = $(ev.currentTarget).data("line-id");
      var productId = $(ev.currentTarget).data("product-id");
      return this._rpc({
        route: "/shop/cart/update_json",
        params: { line_id: lineId, product_id: productId, set_qty: 0 },
      }).then(this._refreshCart.bind(this));
    },
    _refreshCart: function (data) {
      var self = this;
      data["cart_quantity"] = data.cart_quantity || 0;
      wSaleUtils.updateCartNavBar(data);
      return $.get("/shop/cart", { type: "dr_sale_cart_request" }).then(
        function (data) {
          var $data = $(data);
          self.$el.children().remove();
          $data.children().appendTo(self.$el);
          return;
        },
      );
    },
  });
  publicWidget.registry.DrAjaxLoadProducts = publicWidget.Widget.extend({
    xmlDependencies: ["/droggol_theme_common/static/src/xml/website_sale.xml"],
    selector: "#products_grid",
    start: function () {
      var self = this;
      var defs = [this._super.apply(this, arguments)];
      var ajaxEnabled = this.$target.attr("data-ajax-enable");
      this.ajaxEnabled = ajaxEnabled ? ajaxEnabled : false;
      this.$pager = $(".products_pager:not(.dr_dump_pager)");
      if (
        this.ajaxEnabled &&
        this.$pager.children().length &&
        this.$(".o_wsale_products_grid_table_wrapper tbody tr:last").length
      ) {
        this.$pager.addClass("d-none");
        this._setState();
        var position = $(window).scrollTop();
        $(window).on(
          "scroll.ajax_load_product",
          _.throttle(function (ev) {
            var scroll = $(window).scrollTop();
            if (scroll > position) {
              self._onScrollEvent(ev);
            }
            position = scroll;
          }, 20),
        );
      }
      return Promise.all(defs);
    },
    _setState: function () {
      this.$lastLoadedProduct = this.$(
        ".o_wsale_products_grid_table_wrapper tbody tr:last",
      );
      this.$productsContainer = this.$(
        ".o_wsale_products_grid_table_wrapper tbody",
      );
      this.readyNextForAjax = true;
      this.pageURL = this.$pager.find("li:last a").attr("href");
      this.lastLoadedPage = 1;
      var pages = $(".dr_dump_pager").attr("data-total-page");
      this.totalPages = pages ? parseInt(pages) : false;
    },
    _onScrollEvent: function (ev) {
      var self = this;
      if (
        this.$lastLoadedProduct.offset().top -
          $(window).scrollTop() +
          this.$lastLoadedProduct.height() <
          $(window).height() - 25 &&
        this.readyNextForAjax &&
        this.totalPages > this.lastLoadedPage
      ) {
        this.readyNextForAjax = false;
        var newPage = self.lastLoadedPage + 1;
        $.ajax({
          url: this.pageURL,
          type: "GET",
          beforeSend: function () {
            var tmpl = qweb.render("droggol_small_loader");
            $(tmpl).appendTo(self.$(".o_wsale_products_grid_table_wrapper"));
          },
          success: function (page) {
            self.$(".dr_small_loader").remove();
            var $renderedPage = $(page);
            var $productsToAdd = $renderedPage.find(
              "#products_grid .o_wsale_products_grid_table_wrapper table tr",
            );
            self.$productsContainer.append($productsToAdd);
            self.readyNextForAjax = true;
            self.$lastLoadedProduct = self.$(
              ".o_wsale_products_grid_table_wrapper tbody tr:last",
            );
            self.lastLoadedPage = newPage;
            self.pageURL = $renderedPage
              .find(".products_pager:not(.dr_dump_pager) li:last a")
              .attr("href");
            if (
              $renderedPage
                .find(".products_pager:not(.dr_dump_pager) li:last")
                .hasClass("disabled")
            ) {
              var tmpl = qweb.render("dr_all_products_loaded");
              $(tmpl).appendTo(self.$(".o_wsale_products_grid_table_wrapper"));
            }
          },
        });
      }
    },
  });
});

/* /theme_prime/static/lib/ion.rangeSlider-2.3.0/js/ion.rangeSlider.js defined in bundle 'web.assets_frontend_lazy' */
(function (factory) {
  if (!jQuery && typeof define === "function" && define.amd) {
    define(["jquery"], function (jQuery) {
      return factory(jQuery, document, window, navigator);
    });
  } else if (!jQuery && typeof exports === "object") {
    factory(require("jquery"), document, window, navigator);
  } else {
    factory(jQuery, document, window, navigator);
  }
})(function ($, document, window, navigator, undefined) {
  "use strict";
  var plugin_count = 0;
  var is_old_ie = (function () {
    var n = navigator.userAgent,
      r = /msie\s\d+/i,
      v;
    if (n.search(r) > 0) {
      v = r.exec(n).toString();
      v = v.split(" ")[1];
      if (v < 9) {
        $("html").addClass("lt-ie9");
        return true;
      }
    }
    return false;
  })();
  if (!Function.prototype.bind) {
    Function.prototype.bind = function bind(that) {
      var target = this;
      var slice = [].slice;
      if (typeof target != "function") {
        throw new TypeError();
      }
      var args = slice.call(arguments, 1),
        bound = function () {
          if (this instanceof bound) {
            var F = function () {};
            F.prototype = target.prototype;
            var self = new F();
            var result = target.apply(self, args.concat(slice.call(arguments)));
            if (Object(result) === result) {
              return result;
            }
            return self;
          } else {
            return target.apply(that, args.concat(slice.call(arguments)));
          }
        };
      return bound;
    };
  }
  if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function (searchElement, fromIndex) {
      var k;
      if (this == null) {
        throw new TypeError('"this" is null or not defined');
      }
      var O = Object(this);
      var len = O.length >>> 0;
      if (len === 0) {
        return -1;
      }
      var n = +fromIndex || 0;
      if (Math.abs(n) === Infinity) {
        n = 0;
      }
      if (n >= len) {
        return -1;
      }
      k = Math.max(n >= 0 ? n : len - Math.abs(n), 0);
      while (k < len) {
        if (k in O && O[k] === searchElement) {
          return k;
        }
        k++;
      }
      return -1;
    };
  }
  var base_html =
    '<span class="irs">' +
    '<span class="irs-line" tabindex="0"></span>' +
    '<span class="irs-min">0</span><span class="irs-max">1</span>' +
    '<span class="irs-from">0</span><span class="irs-to">0</span><span class="irs-single">0</span>' +
    "</span>" +
    '<span class="irs-grid"></span>';
  var single_html =
    '<span class="irs-bar irs-bar--single"></span>' +
    '<span class="irs-shadow shadow-single"></span>' +
    '<span class="irs-handle single"><i></i><i></i><i></i></span>';
  var double_html =
    '<span class="irs-bar"></span>' +
    '<span class="irs-shadow shadow-from"></span>' +
    '<span class="irs-shadow shadow-to"></span>' +
    '<span class="irs-handle from"><i></i><i></i><i></i></span>' +
    '<span class="irs-handle to"><i></i><i></i><i></i></span>';
  var disable_html = '<span class="irs-disable-mask"></span>';
  var IonRangeSlider = function (input, options, plugin_count) {
    this.VERSION = "2.3.0";
    this.input = input;
    this.plugin_count = plugin_count;
    this.current_plugin = 0;
    this.calc_count = 0;
    this.update_tm = 0;
    this.old_from = 0;
    this.old_to = 0;
    this.old_min_interval = null;
    this.raf_id = null;
    this.dragging = false;
    this.force_redraw = false;
    this.no_diapason = false;
    this.has_tab_index = true;
    this.is_key = false;
    this.is_update = false;
    this.is_start = true;
    this.is_finish = false;
    this.is_active = false;
    this.is_resize = false;
    this.is_click = false;
    options = options || {};
    this.$cache = {
      win: $(window),
      body: $(document.body),
      input: $(input),
      cont: null,
      rs: null,
      min: null,
      max: null,
      from: null,
      to: null,
      single: null,
      bar: null,
      line: null,
      s_single: null,
      s_from: null,
      s_to: null,
      shad_single: null,
      shad_from: null,
      shad_to: null,
      edge: null,
      grid: null,
      grid_labels: [],
    };
    this.coords = {
      x_gap: 0,
      x_pointer: 0,
      w_rs: 0,
      w_rs_old: 0,
      w_handle: 0,
      p_gap: 0,
      p_gap_left: 0,
      p_gap_right: 0,
      p_step: 0,
      p_pointer: 0,
      p_handle: 0,
      p_single_fake: 0,
      p_single_real: 0,
      p_from_fake: 0,
      p_from_real: 0,
      p_to_fake: 0,
      p_to_real: 0,
      p_bar_x: 0,
      p_bar_w: 0,
      grid_gap: 0,
      big_num: 0,
      big: [],
      big_w: [],
      big_p: [],
      big_x: [],
    };
    this.labels = {
      w_min: 0,
      w_max: 0,
      w_from: 0,
      w_to: 0,
      w_single: 0,
      p_min: 0,
      p_max: 0,
      p_from_fake: 0,
      p_from_left: 0,
      p_to_fake: 0,
      p_to_left: 0,
      p_single_fake: 0,
      p_single_left: 0,
    };
    var $inp = this.$cache.input,
      val = $inp.prop("value"),
      config,
      config_from_data,
      prop;
    config = {
      skin: "flat",
      type: "single",
      min: 10,
      max: 100,
      from: null,
      to: null,
      step: 1,
      min_interval: 0,
      max_interval: 0,
      drag_interval: false,
      values: [],
      p_values: [],
      from_fixed: false,
      from_min: null,
      from_max: null,
      from_shadow: false,
      to_fixed: false,
      to_min: null,
      to_max: null,
      to_shadow: false,
      prettify_enabled: true,
      prettify_separator: " ",
      prettify: null,
      force_edges: false,
      keyboard: true,
      grid: false,
      grid_margin: true,
      grid_num: 4,
      grid_snap: false,
      hide_min_max: false,
      hide_from_to: false,
      prefix: "",
      postfix: "",
      max_postfix: "",
      decorate_both: true,
      values_separator: " — ",
      input_values_separator: ";",
      disable: false,
      block: false,
      extra_classes: "",
      scope: null,
      onStart: null,
      onChange: null,
      onFinish: null,
      onUpdate: null,
    };
    if ($inp[0].nodeName !== "INPUT") {
      console &&
        console.warn &&
        console.warn("Base element should be <input>!", $inp[0]);
    }
    config_from_data = {
      skin: $inp.data("skin"),
      type: $inp.data("type"),
      min: $inp.data("min"),
      max: $inp.data("max"),
      from: $inp.data("from"),
      to: $inp.data("to"),
      step: $inp.data("step"),
      min_interval: $inp.data("minInterval"),
      max_interval: $inp.data("maxInterval"),
      drag_interval: $inp.data("dragInterval"),
      values: $inp.data("values"),
      from_fixed: $inp.data("fromFixed"),
      from_min: $inp.data("fromMin"),
      from_max: $inp.data("fromMax"),
      from_shadow: $inp.data("fromShadow"),
      to_fixed: $inp.data("toFixed"),
      to_min: $inp.data("toMin"),
      to_max: $inp.data("toMax"),
      to_shadow: $inp.data("toShadow"),
      prettify_enabled: $inp.data("prettifyEnabled"),
      prettify_separator: $inp.data("prettifySeparator"),
      force_edges: $inp.data("forceEdges"),
      keyboard: $inp.data("keyboard"),
      grid: $inp.data("grid"),
      grid_margin: $inp.data("gridMargin"),
      grid_num: $inp.data("gridNum"),
      grid_snap: $inp.data("gridSnap"),
      hide_min_max: $inp.data("hideMinMax"),
      hide_from_to: $inp.data("hideFromTo"),
      prefix: $inp.data("prefix"),
      postfix: $inp.data("postfix"),
      max_postfix: $inp.data("maxPostfix"),
      decorate_both: $inp.data("decorateBoth"),
      values_separator: $inp.data("valuesSeparator"),
      input_values_separator: $inp.data("inputValuesSeparator"),
      disable: $inp.data("disable"),
      block: $inp.data("block"),
      extra_classes: $inp.data("extraClasses"),
    };
    config_from_data.values =
      config_from_data.values && config_from_data.values.split(",");
    for (prop in config_from_data) {
      if (config_from_data.hasOwnProperty(prop)) {
        if (
          config_from_data[prop] === undefined ||
          config_from_data[prop] === ""
        ) {
          delete config_from_data[prop];
        }
      }
    }
    if (val !== undefined && val !== "") {
      val = val.split(
        config_from_data.input_values_separator ||
          options.input_values_separator ||
          ";",
      );
      if (val[0] && val[0] == +val[0]) {
        val[0] = +val[0];
      }
      if (val[1] && val[1] == +val[1]) {
        val[1] = +val[1];
      }
      if (options && options.values && options.values.length) {
        config.from = val[0] && options.values.indexOf(val[0]);
        config.to = val[1] && options.values.indexOf(val[1]);
      } else {
        config.from = val[0] && +val[0];
        config.to = val[1] && +val[1];
      }
    }
    $.extend(config, options);
    $.extend(config, config_from_data);
    this.options = config;
    this.update_check = {};
    this.validate();
    this.result = {
      input: this.$cache.input,
      slider: null,
      min: this.options.min,
      max: this.options.max,
      from: this.options.from,
      from_percent: 0,
      from_value: null,
      to: this.options.to,
      to_percent: 0,
      to_value: null,
    };
    this.init();
  };
  IonRangeSlider.prototype = {
    init: function (is_update) {
      this.no_diapason = false;
      this.coords.p_step = this.convertToPercent(this.options.step, true);
      this.target = "base";
      this.toggleInput();
      this.append();
      this.setMinMax();
      if (is_update) {
        this.force_redraw = true;
        this.calc(true);
        this.callOnUpdate();
      } else {
        this.force_redraw = true;
        this.calc(true);
        this.callOnStart();
      }
      this.updateScene();
    },
    append: function () {
      var container_html =
        '<span class="irs irs--' +
        this.options.skin +
        " js-irs-" +
        this.plugin_count +
        " " +
        this.options.extra_classes +
        '"></span>';
      this.$cache.input.before(container_html);
      this.$cache.input.prop("readonly", true);
      this.$cache.cont = this.$cache.input.prev();
      this.result.slider = this.$cache.cont;
      this.$cache.cont.html(base_html);
      this.$cache.rs = this.$cache.cont.find(".irs");
      this.$cache.min = this.$cache.cont.find(".irs-min");
      this.$cache.max = this.$cache.cont.find(".irs-max");
      this.$cache.from = this.$cache.cont.find(".irs-from");
      this.$cache.to = this.$cache.cont.find(".irs-to");
      this.$cache.single = this.$cache.cont.find(".irs-single");
      this.$cache.line = this.$cache.cont.find(".irs-line");
      this.$cache.grid = this.$cache.cont.find(".irs-grid");
      if (this.options.type === "single") {
        this.$cache.cont.append(single_html);
        this.$cache.bar = this.$cache.cont.find(".irs-bar");
        this.$cache.edge = this.$cache.cont.find(".irs-bar-edge");
        this.$cache.s_single = this.$cache.cont.find(".single");
        this.$cache.from[0].style.visibility = "hidden";
        this.$cache.to[0].style.visibility = "hidden";
        this.$cache.shad_single = this.$cache.cont.find(".shadow-single");
      } else {
        this.$cache.cont.append(double_html);
        this.$cache.bar = this.$cache.cont.find(".irs-bar");
        this.$cache.s_from = this.$cache.cont.find(".from");
        this.$cache.s_to = this.$cache.cont.find(".to");
        this.$cache.shad_from = this.$cache.cont.find(".shadow-from");
        this.$cache.shad_to = this.$cache.cont.find(".shadow-to");
        this.setTopHandler();
      }
      if (this.options.hide_from_to) {
        this.$cache.from[0].style.display = "none";
        this.$cache.to[0].style.display = "none";
        this.$cache.single[0].style.display = "none";
      }
      this.appendGrid();
      if (this.options.disable) {
        this.appendDisableMask();
        this.$cache.input[0].disabled = true;
      } else {
        this.$cache.input[0].disabled = false;
        this.removeDisableMask();
        this.bindEvents();
      }
      if (!this.options.disable) {
        if (this.options.block) {
          this.appendDisableMask();
        } else {
          this.removeDisableMask();
        }
      }
      if (this.options.drag_interval) {
        this.$cache.bar[0].style.cursor = "ew-resize";
      }
    },
    setTopHandler: function () {
      var min = this.options.min,
        max = this.options.max,
        from = this.options.from,
        to = this.options.to;
      if (from > min && to === max) {
        this.$cache.s_from.addClass("type_last");
      } else if (to < max) {
        this.$cache.s_to.addClass("type_last");
      }
    },
    changeLevel: function (target) {
      switch (target) {
        case "single":
          this.coords.p_gap = this.toFixed(
            this.coords.p_pointer - this.coords.p_single_fake,
          );
          this.$cache.s_single.addClass("state_hover");
          break;
        case "from":
          this.coords.p_gap = this.toFixed(
            this.coords.p_pointer - this.coords.p_from_fake,
          );
          this.$cache.s_from.addClass("state_hover");
          this.$cache.s_from.addClass("type_last");
          this.$cache.s_to.removeClass("type_last");
          break;
        case "to":
          this.coords.p_gap = this.toFixed(
            this.coords.p_pointer - this.coords.p_to_fake,
          );
          this.$cache.s_to.addClass("state_hover");
          this.$cache.s_to.addClass("type_last");
          this.$cache.s_from.removeClass("type_last");
          break;
        case "both":
          this.coords.p_gap_left = this.toFixed(
            this.coords.p_pointer - this.coords.p_from_fake,
          );
          this.coords.p_gap_right = this.toFixed(
            this.coords.p_to_fake - this.coords.p_pointer,
          );
          this.$cache.s_to.removeClass("type_last");
          this.$cache.s_from.removeClass("type_last");
          break;
      }
    },
    appendDisableMask: function () {
      this.$cache.cont.append(disable_html);
      this.$cache.cont.addClass("irs-disabled");
    },
    removeDisableMask: function () {
      this.$cache.cont.remove(".irs-disable-mask");
      this.$cache.cont.removeClass("irs-disabled");
    },
    remove: function () {
      this.$cache.cont.remove();
      this.$cache.cont = null;
      this.$cache.line.off("keydown.irs_" + this.plugin_count);
      this.$cache.body.off("touchmove.irs_" + this.plugin_count);
      this.$cache.body.off("mousemove.irs_" + this.plugin_count);
      this.$cache.win.off("touchend.irs_" + this.plugin_count);
      this.$cache.win.off("mouseup.irs_" + this.plugin_count);
      if (is_old_ie) {
        this.$cache.body.off("mouseup.irs_" + this.plugin_count);
        this.$cache.body.off("mouseleave.irs_" + this.plugin_count);
      }
      this.$cache.grid_labels = [];
      this.coords.big = [];
      this.coords.big_w = [];
      this.coords.big_p = [];
      this.coords.big_x = [];
      cancelAnimationFrame(this.raf_id);
    },
    bindEvents: function () {
      if (this.no_diapason) {
        return;
      }
      this.$cache.body.on(
        "touchmove.irs_" + this.plugin_count,
        this.pointerMove.bind(this),
      );
      this.$cache.body.on(
        "mousemove.irs_" + this.plugin_count,
        this.pointerMove.bind(this),
      );
      this.$cache.win.on(
        "touchend.irs_" + this.plugin_count,
        this.pointerUp.bind(this),
      );
      this.$cache.win.on(
        "mouseup.irs_" + this.plugin_count,
        this.pointerUp.bind(this),
      );
      this.$cache.line.on(
        "touchstart.irs_" + this.plugin_count,
        this.pointerClick.bind(this, "click"),
      );
      this.$cache.line.on(
        "mousedown.irs_" + this.plugin_count,
        this.pointerClick.bind(this, "click"),
      );
      this.$cache.line.on(
        "focus.irs_" + this.plugin_count,
        this.pointerFocus.bind(this),
      );
      if (this.options.drag_interval && this.options.type === "double") {
        this.$cache.bar.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "both"),
        );
        this.$cache.bar.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "both"),
        );
      } else {
        this.$cache.bar.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.bar.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
      }
      if (this.options.type === "single") {
        this.$cache.single.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "single"),
        );
        this.$cache.s_single.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "single"),
        );
        this.$cache.shad_single.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.single.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "single"),
        );
        this.$cache.s_single.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "single"),
        );
        this.$cache.edge.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.shad_single.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
      } else {
        this.$cache.single.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, null),
        );
        this.$cache.single.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, null),
        );
        this.$cache.from.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "from"),
        );
        this.$cache.s_from.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "from"),
        );
        this.$cache.to.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "to"),
        );
        this.$cache.s_to.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "to"),
        );
        this.$cache.shad_from.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.shad_to.on(
          "touchstart.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.from.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "from"),
        );
        this.$cache.s_from.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "from"),
        );
        this.$cache.to.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "to"),
        );
        this.$cache.s_to.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerDown.bind(this, "to"),
        );
        this.$cache.shad_from.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
        this.$cache.shad_to.on(
          "mousedown.irs_" + this.plugin_count,
          this.pointerClick.bind(this, "click"),
        );
      }
      if (this.options.keyboard) {
        this.$cache.line.on(
          "keydown.irs_" + this.plugin_count,
          this.key.bind(this, "keyboard"),
        );
      }
      if (is_old_ie) {
        this.$cache.body.on(
          "mouseup.irs_" + this.plugin_count,
          this.pointerUp.bind(this),
        );
        this.$cache.body.on(
          "mouseleave.irs_" + this.plugin_count,
          this.pointerUp.bind(this),
        );
      }
    },
    pointerFocus: function (e) {
      if (!this.target) {
        var x;
        var $handle;
        if (this.options.type === "single") {
          $handle = this.$cache.single;
        } else {
          $handle = this.$cache.from;
        }
        x = $handle.offset().left;
        x += $handle.width() / 2 - 1;
        this.pointerClick("single", {
          preventDefault: function () {},
          pageX: x,
        });
      }
    },
    pointerMove: function (e) {
      if (!this.dragging) {
        return;
      }
      var x =
        e.pageX ||
        (e.originalEvent.touches && e.originalEvent.touches[0].pageX);
      this.coords.x_pointer = x - this.coords.x_gap;
      this.calc();
    },
    pointerUp: function (e) {
      if (this.current_plugin !== this.plugin_count) {
        return;
      }
      if (this.is_active) {
        this.is_active = false;
      } else {
        return;
      }
      this.$cache.cont.find(".state_hover").removeClass("state_hover");
      this.force_redraw = true;
      if (is_old_ie) {
        $("*").prop("unselectable", false);
      }
      this.updateScene();
      this.restoreOriginalMinInterval();
      if ($.contains(this.$cache.cont[0], e.target) || this.dragging) {
        this.callOnFinish();
      }
      this.dragging = false;
    },
    pointerDown: function (target, e) {
      e.preventDefault();
      var x =
        e.pageX ||
        (e.originalEvent.touches && e.originalEvent.touches[0].pageX);
      if (e.button === 2) {
        return;
      }
      if (target === "both") {
        this.setTempMinInterval();
      }
      if (!target) {
        target = this.target || "from";
      }
      this.current_plugin = this.plugin_count;
      this.target = target;
      this.is_active = true;
      this.dragging = true;
      this.coords.x_gap = this.$cache.rs.offset().left;
      this.coords.x_pointer = x - this.coords.x_gap;
      this.calcPointerPercent();
      this.changeLevel(target);
      if (is_old_ie) {
        $("*").prop("unselectable", true);
      }
      this.$cache.line.trigger("focus");
      this.updateScene();
    },
    pointerClick: function (target, e) {
      e.preventDefault();
      var x =
        e.pageX ||
        (e.originalEvent.touches && e.originalEvent.touches[0].pageX);
      if (e.button === 2) {
        return;
      }
      this.current_plugin = this.plugin_count;
      this.target = target;
      this.is_click = true;
      this.coords.x_gap = this.$cache.rs.offset().left;
      this.coords.x_pointer = +(x - this.coords.x_gap).toFixed();
      this.force_redraw = true;
      this.calc();
      this.$cache.line.trigger("focus");
    },
    key: function (target, e) {
      if (
        this.current_plugin !== this.plugin_count ||
        e.altKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.metaKey
      ) {
        return;
      }
      switch (e.which) {
        case 83:
        case 65:
        case 40:
        case 37:
          e.preventDefault();
          this.moveByKey(false);
          break;
        case 87:
        case 68:
        case 38:
        case 39:
          e.preventDefault();
          this.moveByKey(true);
          break;
      }
      return true;
    },
    moveByKey: function (right) {
      var p = this.coords.p_pointer;
      var p_step = (this.options.max - this.options.min) / 100;
      p_step = this.options.step / p_step;
      if (right) {
        p += p_step;
      } else {
        p -= p_step;
      }
      this.coords.x_pointer = this.toFixed((this.coords.w_rs / 100) * p);
      this.is_key = true;
      this.calc();
    },
    setMinMax: function () {
      if (!this.options) {
        return;
      }
      if (this.options.hide_min_max) {
        this.$cache.min[0].style.display = "none";
        this.$cache.max[0].style.display = "none";
        return;
      }
      if (this.options.values.length) {
        this.$cache.min.html(
          this.decorate(this.options.p_values[this.options.min]),
        );
        this.$cache.max.html(
          this.decorate(this.options.p_values[this.options.max]),
        );
      } else {
        var min_pretty = this._prettify(this.options.min);
        var max_pretty = this._prettify(this.options.max);
        this.result.min_pretty = min_pretty;
        this.result.max_pretty = max_pretty;
        this.$cache.min.html(this.decorate(min_pretty, this.options.min));
        this.$cache.max.html(this.decorate(max_pretty, this.options.max));
      }
      this.labels.w_min = this.$cache.min.outerWidth(false);
      this.labels.w_max = this.$cache.max.outerWidth(false);
    },
    setTempMinInterval: function () {
      var interval = this.result.to - this.result.from;
      if (this.old_min_interval === null) {
        this.old_min_interval = this.options.min_interval;
      }
      this.options.min_interval = interval;
    },
    restoreOriginalMinInterval: function () {
      if (this.old_min_interval !== null) {
        this.options.min_interval = this.old_min_interval;
        this.old_min_interval = null;
      }
    },
    calc: function (update) {
      if (!this.options) {
        return;
      }
      this.calc_count++;
      if (this.calc_count === 10 || update) {
        this.calc_count = 0;
        this.coords.w_rs = this.$cache.rs.outerWidth(false);
        this.calcHandlePercent();
      }
      if (!this.coords.w_rs) {
        return;
      }
      this.calcPointerPercent();
      var handle_x = this.getHandleX();
      if (this.target === "both") {
        this.coords.p_gap = 0;
        handle_x = this.getHandleX();
      }
      if (this.target === "click") {
        this.coords.p_gap = this.coords.p_handle / 2;
        handle_x = this.getHandleX();
        if (this.options.drag_interval) {
          this.target = "both_one";
        } else {
          this.target = this.chooseHandle(handle_x);
        }
      }
      switch (this.target) {
        case "base":
          var w = (this.options.max - this.options.min) / 100,
            f = (this.result.from - this.options.min) / w,
            t = (this.result.to - this.options.min) / w;
          this.coords.p_single_real = this.toFixed(f);
          this.coords.p_from_real = this.toFixed(f);
          this.coords.p_to_real = this.toFixed(t);
          this.coords.p_single_real = this.checkDiapason(
            this.coords.p_single_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_from_real = this.checkDiapason(
            this.coords.p_from_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_to_real = this.checkDiapason(
            this.coords.p_to_real,
            this.options.to_min,
            this.options.to_max,
          );
          this.coords.p_single_fake = this.convertToFakePercent(
            this.coords.p_single_real,
          );
          this.coords.p_from_fake = this.convertToFakePercent(
            this.coords.p_from_real,
          );
          this.coords.p_to_fake = this.convertToFakePercent(
            this.coords.p_to_real,
          );
          this.target = null;
          break;
        case "single":
          if (this.options.from_fixed) {
            break;
          }
          this.coords.p_single_real = this.convertToRealPercent(handle_x);
          this.coords.p_single_real = this.calcWithStep(
            this.coords.p_single_real,
          );
          this.coords.p_single_real = this.checkDiapason(
            this.coords.p_single_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_single_fake = this.convertToFakePercent(
            this.coords.p_single_real,
          );
          break;
        case "from":
          if (this.options.from_fixed) {
            break;
          }
          this.coords.p_from_real = this.convertToRealPercent(handle_x);
          this.coords.p_from_real = this.calcWithStep(this.coords.p_from_real);
          if (this.coords.p_from_real > this.coords.p_to_real) {
            this.coords.p_from_real = this.coords.p_to_real;
          }
          this.coords.p_from_real = this.checkDiapason(
            this.coords.p_from_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_from_real = this.checkMinInterval(
            this.coords.p_from_real,
            this.coords.p_to_real,
            "from",
          );
          this.coords.p_from_real = this.checkMaxInterval(
            this.coords.p_from_real,
            this.coords.p_to_real,
            "from",
          );
          this.coords.p_from_fake = this.convertToFakePercent(
            this.coords.p_from_real,
          );
          break;
        case "to":
          if (this.options.to_fixed) {
            break;
          }
          this.coords.p_to_real = this.convertToRealPercent(handle_x);
          this.coords.p_to_real = this.calcWithStep(this.coords.p_to_real);
          if (this.coords.p_to_real < this.coords.p_from_real) {
            this.coords.p_to_real = this.coords.p_from_real;
          }
          this.coords.p_to_real = this.checkDiapason(
            this.coords.p_to_real,
            this.options.to_min,
            this.options.to_max,
          );
          this.coords.p_to_real = this.checkMinInterval(
            this.coords.p_to_real,
            this.coords.p_from_real,
            "to",
          );
          this.coords.p_to_real = this.checkMaxInterval(
            this.coords.p_to_real,
            this.coords.p_from_real,
            "to",
          );
          this.coords.p_to_fake = this.convertToFakePercent(
            this.coords.p_to_real,
          );
          break;
        case "both":
          if (this.options.from_fixed || this.options.to_fixed) {
            break;
          }
          handle_x = this.toFixed(handle_x + this.coords.p_handle * 0.001);
          this.coords.p_from_real =
            this.convertToRealPercent(handle_x) - this.coords.p_gap_left;
          this.coords.p_from_real = this.calcWithStep(this.coords.p_from_real);
          this.coords.p_from_real = this.checkDiapason(
            this.coords.p_from_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_from_real = this.checkMinInterval(
            this.coords.p_from_real,
            this.coords.p_to_real,
            "from",
          );
          this.coords.p_from_fake = this.convertToFakePercent(
            this.coords.p_from_real,
          );
          this.coords.p_to_real =
            this.convertToRealPercent(handle_x) + this.coords.p_gap_right;
          this.coords.p_to_real = this.calcWithStep(this.coords.p_to_real);
          this.coords.p_to_real = this.checkDiapason(
            this.coords.p_to_real,
            this.options.to_min,
            this.options.to_max,
          );
          this.coords.p_to_real = this.checkMinInterval(
            this.coords.p_to_real,
            this.coords.p_from_real,
            "to",
          );
          this.coords.p_to_fake = this.convertToFakePercent(
            this.coords.p_to_real,
          );
          break;
        case "both_one":
          if (this.options.from_fixed || this.options.to_fixed) {
            break;
          }
          var real_x = this.convertToRealPercent(handle_x),
            from = this.result.from_percent,
            to = this.result.to_percent,
            full = to - from,
            half = full / 2,
            new_from = real_x - half,
            new_to = real_x + half;
          if (new_from < 0) {
            new_from = 0;
            new_to = new_from + full;
          }
          if (new_to > 100) {
            new_to = 100;
            new_from = new_to - full;
          }
          this.coords.p_from_real = this.calcWithStep(new_from);
          this.coords.p_from_real = this.checkDiapason(
            this.coords.p_from_real,
            this.options.from_min,
            this.options.from_max,
          );
          this.coords.p_from_fake = this.convertToFakePercent(
            this.coords.p_from_real,
          );
          this.coords.p_to_real = this.calcWithStep(new_to);
          this.coords.p_to_real = this.checkDiapason(
            this.coords.p_to_real,
            this.options.to_min,
            this.options.to_max,
          );
          this.coords.p_to_fake = this.convertToFakePercent(
            this.coords.p_to_real,
          );
          break;
      }
      if (this.options.type === "single") {
        this.coords.p_bar_x = this.coords.p_handle / 2;
        this.coords.p_bar_w = this.coords.p_single_fake;
        this.result.from_percent = this.coords.p_single_real;
        this.result.from = this.convertToValue(this.coords.p_single_real);
        this.result.from_pretty = this._prettify(this.result.from);
        if (this.options.values.length) {
          this.result.from_value = this.options.values[this.result.from];
        }
      } else {
        this.coords.p_bar_x = this.toFixed(
          this.coords.p_from_fake + this.coords.p_handle / 2,
        );
        this.coords.p_bar_w = this.toFixed(
          this.coords.p_to_fake - this.coords.p_from_fake,
        );
        this.result.from_percent = this.coords.p_from_real;
        this.result.from = this.convertToValue(this.coords.p_from_real);
        this.result.from_pretty = this._prettify(this.result.from);
        this.result.to_percent = this.coords.p_to_real;
        this.result.to = this.convertToValue(this.coords.p_to_real);
        this.result.to_pretty = this._prettify(this.result.to);
        if (this.options.values.length) {
          this.result.from_value = this.options.values[this.result.from];
          this.result.to_value = this.options.values[this.result.to];
        }
      }
      this.calcMinMax();
      this.calcLabels();
    },
    calcPointerPercent: function () {
      if (!this.coords.w_rs) {
        this.coords.p_pointer = 0;
        return;
      }
      if (this.coords.x_pointer < 0 || isNaN(this.coords.x_pointer)) {
        this.coords.x_pointer = 0;
      } else if (this.coords.x_pointer > this.coords.w_rs) {
        this.coords.x_pointer = this.coords.w_rs;
      }
      this.coords.p_pointer = this.toFixed(
        (this.coords.x_pointer / this.coords.w_rs) * 100,
      );
    },
    convertToRealPercent: function (fake) {
      var full = 100 - this.coords.p_handle;
      return (fake / full) * 100;
    },
    convertToFakePercent: function (real) {
      var full = 100 - this.coords.p_handle;
      return (real / 100) * full;
    },
    getHandleX: function () {
      var max = 100 - this.coords.p_handle,
        x = this.toFixed(this.coords.p_pointer - this.coords.p_gap);
      if (x < 0) {
        x = 0;
      } else if (x > max) {
        x = max;
      }
      return x;
    },
    calcHandlePercent: function () {
      if (this.options.type === "single") {
        this.coords.w_handle = this.$cache.s_single.outerWidth(false);
      } else {
        this.coords.w_handle = this.$cache.s_from.outerWidth(false);
      }
      this.coords.p_handle = this.toFixed(
        (this.coords.w_handle / this.coords.w_rs) * 100,
      );
    },
    chooseHandle: function (real_x) {
      if (this.options.type === "single") {
        return "single";
      } else {
        var m_point =
          this.coords.p_from_real +
          (this.coords.p_to_real - this.coords.p_from_real) / 2;
        if (real_x >= m_point) {
          return this.options.to_fixed ? "from" : "to";
        } else {
          return this.options.from_fixed ? "to" : "from";
        }
      }
    },
    calcMinMax: function () {
      if (!this.coords.w_rs) {
        return;
      }
      this.labels.p_min = (this.labels.w_min / this.coords.w_rs) * 100;
      this.labels.p_max = (this.labels.w_max / this.coords.w_rs) * 100;
    },
    calcLabels: function () {
      if (!this.coords.w_rs || this.options.hide_from_to) {
        return;
      }
      if (this.options.type === "single") {
        this.labels.w_single = this.$cache.single.outerWidth(false);
        this.labels.p_single_fake =
          (this.labels.w_single / this.coords.w_rs) * 100;
        this.labels.p_single_left =
          this.coords.p_single_fake +
          this.coords.p_handle / 2 -
          this.labels.p_single_fake / 2;
        this.labels.p_single_left = this.checkEdges(
          this.labels.p_single_left,
          this.labels.p_single_fake,
        );
      } else {
        this.labels.w_from = this.$cache.from.outerWidth(false);
        this.labels.p_from_fake = (this.labels.w_from / this.coords.w_rs) * 100;
        this.labels.p_from_left =
          this.coords.p_from_fake +
          this.coords.p_handle / 2 -
          this.labels.p_from_fake / 2;
        this.labels.p_from_left = this.toFixed(this.labels.p_from_left);
        this.labels.p_from_left = this.checkEdges(
          this.labels.p_from_left,
          this.labels.p_from_fake,
        );
        this.labels.w_to = this.$cache.to.outerWidth(false);
        this.labels.p_to_fake = (this.labels.w_to / this.coords.w_rs) * 100;
        this.labels.p_to_left =
          this.coords.p_to_fake +
          this.coords.p_handle / 2 -
          this.labels.p_to_fake / 2;
        this.labels.p_to_left = this.toFixed(this.labels.p_to_left);
        this.labels.p_to_left = this.checkEdges(
          this.labels.p_to_left,
          this.labels.p_to_fake,
        );
        this.labels.w_single = this.$cache.single.outerWidth(false);
        this.labels.p_single_fake =
          (this.labels.w_single / this.coords.w_rs) * 100;
        this.labels.p_single_left =
          (this.labels.p_from_left +
            this.labels.p_to_left +
            this.labels.p_to_fake) /
            2 -
          this.labels.p_single_fake / 2;
        this.labels.p_single_left = this.toFixed(this.labels.p_single_left);
        this.labels.p_single_left = this.checkEdges(
          this.labels.p_single_left,
          this.labels.p_single_fake,
        );
      }
    },
    updateScene: function () {
      if (this.raf_id) {
        cancelAnimationFrame(this.raf_id);
        this.raf_id = null;
      }
      clearTimeout(this.update_tm);
      this.update_tm = null;
      if (!this.options) {
        return;
      }
      this.drawHandles();
      if (this.is_active) {
        this.raf_id = requestAnimationFrame(this.updateScene.bind(this));
      } else {
        this.update_tm = setTimeout(this.updateScene.bind(this), 300);
      }
    },
    drawHandles: function () {
      this.coords.w_rs = this.$cache.rs.outerWidth(false);
      if (!this.coords.w_rs) {
        return;
      }
      if (this.coords.w_rs !== this.coords.w_rs_old) {
        this.target = "base";
        this.is_resize = true;
      }
      if (this.coords.w_rs !== this.coords.w_rs_old || this.force_redraw) {
        this.setMinMax();
        this.calc(true);
        this.drawLabels();
        if (this.options.grid) {
          this.calcGridMargin();
          this.calcGridLabels();
        }
        this.force_redraw = true;
        this.coords.w_rs_old = this.coords.w_rs;
        this.drawShadow();
      }
      if (!this.coords.w_rs) {
        return;
      }
      if (!this.dragging && !this.force_redraw && !this.is_key) {
        return;
      }
      if (
        this.old_from !== this.result.from ||
        this.old_to !== this.result.to ||
        this.force_redraw ||
        this.is_key
      ) {
        this.drawLabels();
        this.$cache.bar[0].style.left = this.coords.p_bar_x + "%";
        this.$cache.bar[0].style.width = this.coords.p_bar_w + "%";
        if (this.options.type === "single") {
          this.$cache.bar[0].style.left = 0;
          this.$cache.bar[0].style.width =
            this.coords.p_bar_w + this.coords.p_bar_x + "%";
          this.$cache.s_single[0].style.left = this.coords.p_single_fake + "%";
          this.$cache.single[0].style.left = this.labels.p_single_left + "%";
        } else {
          this.$cache.s_from[0].style.left = this.coords.p_from_fake + "%";
          this.$cache.s_to[0].style.left = this.coords.p_to_fake + "%";
          if (this.old_from !== this.result.from || this.force_redraw) {
            this.$cache.from[0].style.left = this.labels.p_from_left + "%";
          }
          if (this.old_to !== this.result.to || this.force_redraw) {
            this.$cache.to[0].style.left = this.labels.p_to_left + "%";
          }
          this.$cache.single[0].style.left = this.labels.p_single_left + "%";
        }
        this.writeToInput();
        if (
          (this.old_from !== this.result.from ||
            this.old_to !== this.result.to) &&
          !this.is_start
        ) {
          this.$cache.input.trigger("change");
          this.$cache.input.trigger("input");
        }
        this.old_from = this.result.from;
        this.old_to = this.result.to;
        if (
          !this.is_resize &&
          !this.is_update &&
          !this.is_start &&
          !this.is_finish
        ) {
          this.callOnChange();
        }
        if (this.is_key || this.is_click) {
          this.is_key = false;
          this.is_click = false;
          this.callOnFinish();
        }
        this.is_update = false;
        this.is_resize = false;
        this.is_finish = false;
      }
      this.is_start = false;
      this.is_key = false;
      this.is_click = false;
      this.force_redraw = false;
    },
    drawLabels: function () {
      if (!this.options) {
        return;
      }
      var values_num = this.options.values.length;
      var p_values = this.options.p_values;
      var text_single;
      var text_from;
      var text_to;
      var from_pretty;
      var to_pretty;
      if (this.options.hide_from_to) {
        return;
      }
      if (this.options.type === "single") {
        if (values_num) {
          text_single = this.decorate(p_values[this.result.from]);
          this.$cache.single.html(text_single);
        } else {
          from_pretty = this._prettify(this.result.from);
          text_single = this.decorate(from_pretty, this.result.from);
          this.$cache.single.html(text_single);
        }
        this.calcLabels();
        if (this.labels.p_single_left < this.labels.p_min + 1) {
          this.$cache.min[0].style.visibility = "hidden";
        } else {
          this.$cache.min[0].style.visibility = "visible";
        }
        if (
          this.labels.p_single_left + this.labels.p_single_fake >
          100 - this.labels.p_max - 1
        ) {
          this.$cache.max[0].style.visibility = "hidden";
        } else {
          this.$cache.max[0].style.visibility = "visible";
        }
      } else {
        if (values_num) {
          if (this.options.decorate_both) {
            text_single = this.decorate(p_values[this.result.from]);
            text_single += this.options.values_separator;
            text_single += this.decorate(p_values[this.result.to]);
          } else {
            text_single = this.decorate(
              p_values[this.result.from] +
                this.options.values_separator +
                p_values[this.result.to],
            );
          }
          text_from = this.decorate(p_values[this.result.from]);
          text_to = this.decorate(p_values[this.result.to]);
          this.$cache.single.html(text_single);
          this.$cache.from.html(text_from);
          this.$cache.to.html(text_to);
        } else {
          from_pretty = this._prettify(this.result.from);
          to_pretty = this._prettify(this.result.to);
          if (this.options.decorate_both) {
            text_single = this.decorate(from_pretty, this.result.from);
            text_single += this.options.values_separator;
            text_single += this.decorate(to_pretty, this.result.to);
          } else {
            text_single = this.decorate(
              from_pretty + this.options.values_separator + to_pretty,
              this.result.to,
            );
          }
          text_from = this.decorate(from_pretty, this.result.from);
          text_to = this.decorate(to_pretty, this.result.to);
          this.$cache.single.html(text_single);
          this.$cache.from.html(text_from);
          this.$cache.to.html(text_to);
        }
        this.calcLabels();
        var min = Math.min(this.labels.p_single_left, this.labels.p_from_left),
          single_left = this.labels.p_single_left + this.labels.p_single_fake,
          to_left = this.labels.p_to_left + this.labels.p_to_fake,
          max = Math.max(single_left, to_left);
        if (
          this.labels.p_from_left + this.labels.p_from_fake >=
          this.labels.p_to_left
        ) {
          this.$cache.from[0].style.visibility = "hidden";
          this.$cache.to[0].style.visibility = "hidden";
          this.$cache.single[0].style.visibility = "visible";
          if (this.result.from === this.result.to) {
            if (this.target === "from") {
              this.$cache.from[0].style.visibility = "visible";
            } else if (this.target === "to") {
              this.$cache.to[0].style.visibility = "visible";
            } else if (!this.target) {
              this.$cache.from[0].style.visibility = "visible";
            }
            this.$cache.single[0].style.visibility = "hidden";
            max = to_left;
          } else {
            this.$cache.from[0].style.visibility = "hidden";
            this.$cache.to[0].style.visibility = "hidden";
            this.$cache.single[0].style.visibility = "visible";
            max = Math.max(single_left, to_left);
          }
        } else {
          this.$cache.from[0].style.visibility = "visible";
          this.$cache.to[0].style.visibility = "visible";
          this.$cache.single[0].style.visibility = "hidden";
        }
        if (min < this.labels.p_min + 1) {
          this.$cache.min[0].style.visibility = "hidden";
        } else {
          this.$cache.min[0].style.visibility = "visible";
        }
        if (max > 100 - this.labels.p_max - 1) {
          this.$cache.max[0].style.visibility = "hidden";
        } else {
          this.$cache.max[0].style.visibility = "visible";
        }
      }
    },
    drawShadow: function () {
      var o = this.options,
        c = this.$cache,
        is_from_min = typeof o.from_min === "number" && !isNaN(o.from_min),
        is_from_max = typeof o.from_max === "number" && !isNaN(o.from_max),
        is_to_min = typeof o.to_min === "number" && !isNaN(o.to_min),
        is_to_max = typeof o.to_max === "number" && !isNaN(o.to_max),
        from_min,
        from_max,
        to_min,
        to_max;
      if (o.type === "single") {
        if (o.from_shadow && (is_from_min || is_from_max)) {
          from_min = this.convertToPercent(is_from_min ? o.from_min : o.min);
          from_max =
            this.convertToPercent(is_from_max ? o.from_max : o.max) - from_min;
          from_min = this.toFixed(
            from_min - (this.coords.p_handle / 100) * from_min,
          );
          from_max = this.toFixed(
            from_max - (this.coords.p_handle / 100) * from_max,
          );
          from_min = from_min + this.coords.p_handle / 2;
          c.shad_single[0].style.display = "block";
          c.shad_single[0].style.left = from_min + "%";
          c.shad_single[0].style.width = from_max + "%";
        } else {
          c.shad_single[0].style.display = "none";
        }
      } else {
        if (o.from_shadow && (is_from_min || is_from_max)) {
          from_min = this.convertToPercent(is_from_min ? o.from_min : o.min);
          from_max =
            this.convertToPercent(is_from_max ? o.from_max : o.max) - from_min;
          from_min = this.toFixed(
            from_min - (this.coords.p_handle / 100) * from_min,
          );
          from_max = this.toFixed(
            from_max - (this.coords.p_handle / 100) * from_max,
          );
          from_min = from_min + this.coords.p_handle / 2;
          c.shad_from[0].style.display = "block";
          c.shad_from[0].style.left = from_min + "%";
          c.shad_from[0].style.width = from_max + "%";
        } else {
          c.shad_from[0].style.display = "none";
        }
        if (o.to_shadow && (is_to_min || is_to_max)) {
          to_min = this.convertToPercent(is_to_min ? o.to_min : o.min);
          to_max = this.convertToPercent(is_to_max ? o.to_max : o.max) - to_min;
          to_min = this.toFixed(to_min - (this.coords.p_handle / 100) * to_min);
          to_max = this.toFixed(to_max - (this.coords.p_handle / 100) * to_max);
          to_min = to_min + this.coords.p_handle / 2;
          c.shad_to[0].style.display = "block";
          c.shad_to[0].style.left = to_min + "%";
          c.shad_to[0].style.width = to_max + "%";
        } else {
          c.shad_to[0].style.display = "none";
        }
      }
    },
    writeToInput: function () {
      if (this.options.type === "single") {
        if (this.options.values.length) {
          this.$cache.input.prop("value", this.result.from_value);
        } else {
          this.$cache.input.prop("value", this.result.from);
        }
        this.$cache.input.data("from", this.result.from);
      } else {
        if (this.options.values.length) {
          this.$cache.input.prop(
            "value",
            this.result.from_value +
              this.options.input_values_separator +
              this.result.to_value,
          );
        } else {
          this.$cache.input.prop(
            "value",
            this.result.from +
              this.options.input_values_separator +
              this.result.to,
          );
        }
        this.$cache.input.data("from", this.result.from);
        this.$cache.input.data("to", this.result.to);
      }
    },
    callOnStart: function () {
      this.writeToInput();
      if (this.options.onStart && typeof this.options.onStart === "function") {
        if (this.options.scope) {
          this.options.onStart.call(this.options.scope, this.result);
        } else {
          this.options.onStart(this.result);
        }
      }
    },
    callOnChange: function () {
      this.writeToInput();
      if (
        this.options.onChange &&
        typeof this.options.onChange === "function"
      ) {
        if (this.options.scope) {
          this.options.onChange.call(this.options.scope, this.result);
        } else {
          this.options.onChange(this.result);
        }
      }
    },
    callOnFinish: function () {
      this.writeToInput();
      if (
        this.options.onFinish &&
        typeof this.options.onFinish === "function"
      ) {
        if (this.options.scope) {
          this.options.onFinish.call(this.options.scope, this.result);
        } else {
          this.options.onFinish(this.result);
        }
      }
    },
    callOnUpdate: function () {
      this.writeToInput();
      if (
        this.options.onUpdate &&
        typeof this.options.onUpdate === "function"
      ) {
        if (this.options.scope) {
          this.options.onUpdate.call(this.options.scope, this.result);
        } else {
          this.options.onUpdate(this.result);
        }
      }
    },
    toggleInput: function () {
      this.$cache.input.toggleClass("irs-hidden-input");
      if (this.has_tab_index) {
        this.$cache.input.prop("tabindex", -1);
      } else {
        this.$cache.input.removeProp("tabindex");
      }
      this.has_tab_index = !this.has_tab_index;
    },
    convertToPercent: function (value, no_min) {
      var diapason = this.options.max - this.options.min,
        one_percent = diapason / 100,
        val,
        percent;
      if (!diapason) {
        this.no_diapason = true;
        return 0;
      }
      if (no_min) {
        val = value;
      } else {
        val = value - this.options.min;
      }
      percent = val / one_percent;
      return this.toFixed(percent);
    },
    convertToValue: function (percent) {
      var min = this.options.min,
        max = this.options.max,
        min_decimals = min.toString().split(".")[1],
        max_decimals = max.toString().split(".")[1],
        min_length,
        max_length,
        avg_decimals = 0,
        abs = 0;
      if (percent === 0) {
        return this.options.min;
      }
      if (percent === 100) {
        return this.options.max;
      }
      if (min_decimals) {
        min_length = min_decimals.length;
        avg_decimals = min_length;
      }
      if (max_decimals) {
        max_length = max_decimals.length;
        avg_decimals = max_length;
      }
      if (min_length && max_length) {
        avg_decimals = min_length >= max_length ? min_length : max_length;
      }
      if (min < 0) {
        abs = Math.abs(min);
        min = +(min + abs).toFixed(avg_decimals);
        max = +(max + abs).toFixed(avg_decimals);
      }
      var number = ((max - min) / 100) * percent + min,
        string = this.options.step.toString().split(".")[1],
        result;
      if (string) {
        number = +number.toFixed(string.length);
      } else {
        number = number / this.options.step;
        number = number * this.options.step;
        number = +number.toFixed(0);
      }
      if (abs) {
        number -= abs;
      }
      if (string) {
        result = +number.toFixed(string.length);
      } else {
        result = this.toFixed(number);
      }
      if (result < this.options.min) {
        result = this.options.min;
      } else if (result > this.options.max) {
        result = this.options.max;
      }
      return result;
    },
    calcWithStep: function (percent) {
      var rounded =
        Math.round(percent / this.coords.p_step) * this.coords.p_step;
      if (rounded > 100) {
        rounded = 100;
      }
      if (percent === 100) {
        rounded = 100;
      }
      return this.toFixed(rounded);
    },
    checkMinInterval: function (p_current, p_next, type) {
      var o = this.options,
        current,
        next;
      if (!o.min_interval) {
        return p_current;
      }
      current = this.convertToValue(p_current);
      next = this.convertToValue(p_next);
      if (type === "from") {
        if (next - current < o.min_interval) {
          current = next - o.min_interval;
        }
      } else {
        if (current - next < o.min_interval) {
          current = next + o.min_interval;
        }
      }
      return this.convertToPercent(current);
    },
    checkMaxInterval: function (p_current, p_next, type) {
      var o = this.options,
        current,
        next;
      if (!o.max_interval) {
        return p_current;
      }
      current = this.convertToValue(p_current);
      next = this.convertToValue(p_next);
      if (type === "from") {
        if (next - current > o.max_interval) {
          current = next - o.max_interval;
        }
      } else {
        if (current - next > o.max_interval) {
          current = next + o.max_interval;
        }
      }
      return this.convertToPercent(current);
    },
    checkDiapason: function (p_num, min, max) {
      var num = this.convertToValue(p_num),
        o = this.options;
      if (typeof min !== "number") {
        min = o.min;
      }
      if (typeof max !== "number") {
        max = o.max;
      }
      if (num < min) {
        num = min;
      }
      if (num > max) {
        num = max;
      }
      return this.convertToPercent(num);
    },
    toFixed: function (num) {
      num = num.toFixed(20);
      return +num;
    },
    _prettify: function (num) {
      if (!this.options.prettify_enabled) {
        return num;
      }
      if (
        this.options.prettify &&
        typeof this.options.prettify === "function"
      ) {
        return this.options.prettify(num);
      } else {
        return this.prettify(num);
      }
    },
    prettify: function (num) {
      var n = num.toString();
      return n.replace(
        /(\d{1,3}(?=(?:\d\d\d)+(?!\d)))/g,
        "$1" + this.options.prettify_separator,
      );
    },
    checkEdges: function (left, width) {
      if (!this.options.force_edges) {
        return this.toFixed(left);
      }
      if (left < 0) {
        left = 0;
      } else if (left > 100 - width) {
        left = 100 - width;
      }
      return this.toFixed(left);
    },
    validate: function () {
      var o = this.options,
        r = this.result,
        v = o.values,
        vl = v.length,
        value,
        i;
      if (typeof o.min === "string") o.min = +o.min;
      if (typeof o.max === "string") o.max = +o.max;
      if (typeof o.from === "string") o.from = +o.from;
      if (typeof o.to === "string") o.to = +o.to;
      if (typeof o.step === "string") o.step = +o.step;
      if (typeof o.from_min === "string") o.from_min = +o.from_min;
      if (typeof o.from_max === "string") o.from_max = +o.from_max;
      if (typeof o.to_min === "string") o.to_min = +o.to_min;
      if (typeof o.to_max === "string") o.to_max = +o.to_max;
      if (typeof o.grid_num === "string") o.grid_num = +o.grid_num;
      if (o.max < o.min) {
        o.max = o.min;
      }
      if (vl) {
        o.p_values = [];
        o.min = 0;
        o.max = vl - 1;
        o.step = 1;
        o.grid_num = o.max;
        o.grid_snap = true;
        for (i = 0; i < vl; i++) {
          value = +v[i];
          if (!isNaN(value)) {
            v[i] = value;
            value = this._prettify(value);
          } else {
            value = v[i];
          }
          o.p_values.push(value);
        }
      }
      if (typeof o.from !== "number" || isNaN(o.from)) {
        o.from = o.min;
      }
      if (typeof o.to !== "number" || isNaN(o.to)) {
        o.to = o.max;
      }
      if (o.type === "single") {
        if (o.from < o.min) o.from = o.min;
        if (o.from > o.max) o.from = o.max;
      } else {
        if (o.from < o.min) o.from = o.min;
        if (o.from > o.max) o.from = o.max;
        if (o.to < o.min) o.to = o.min;
        if (o.to > o.max) o.to = o.max;
        if (this.update_check.from) {
          if (this.update_check.from !== o.from) {
            if (o.from > o.to) o.from = o.to;
          }
          if (this.update_check.to !== o.to) {
            if (o.to < o.from) o.to = o.from;
          }
        }
        if (o.from > o.to) o.from = o.to;
        if (o.to < o.from) o.to = o.from;
      }
      if (
        typeof o.step !== "number" ||
        isNaN(o.step) ||
        !o.step ||
        o.step < 0
      ) {
        o.step = 1;
      }
      if (typeof o.from_min === "number" && o.from < o.from_min) {
        o.from = o.from_min;
      }
      if (typeof o.from_max === "number" && o.from > o.from_max) {
        o.from = o.from_max;
      }
      if (typeof o.to_min === "number" && o.to < o.to_min) {
        o.to = o.to_min;
      }
      if (typeof o.to_max === "number" && o.from > o.to_max) {
        o.to = o.to_max;
      }
      if (r) {
        if (r.min !== o.min) {
          r.min = o.min;
        }
        if (r.max !== o.max) {
          r.max = o.max;
        }
        if (r.from < r.min || r.from > r.max) {
          r.from = o.from;
        }
        if (r.to < r.min || r.to > r.max) {
          r.to = o.to;
        }
      }
      if (
        typeof o.min_interval !== "number" ||
        isNaN(o.min_interval) ||
        !o.min_interval ||
        o.min_interval < 0
      ) {
        o.min_interval = 0;
      }
      if (
        typeof o.max_interval !== "number" ||
        isNaN(o.max_interval) ||
        !o.max_interval ||
        o.max_interval < 0
      ) {
        o.max_interval = 0;
      }
      if (o.min_interval && o.min_interval > o.max - o.min) {
        o.min_interval = o.max - o.min;
      }
      if (o.max_interval && o.max_interval > o.max - o.min) {
        o.max_interval = o.max - o.min;
      }
    },
    decorate: function (num, original) {
      var decorated = "",
        o = this.options;
      if (o.prefix) {
        decorated += o.prefix;
      }
      decorated += num;
      if (o.max_postfix) {
        if (o.values.length && num === o.p_values[o.max]) {
          decorated += o.max_postfix;
          if (o.postfix) {
            decorated += " ";
          }
        } else if (original === o.max) {
          decorated += o.max_postfix;
          if (o.postfix) {
            decorated += " ";
          }
        }
      }
      if (o.postfix) {
        decorated += o.postfix;
      }
      return decorated;
    },
    updateFrom: function () {
      this.result.from = this.options.from;
      this.result.from_percent = this.convertToPercent(this.result.from);
      this.result.from_pretty = this._prettify(this.result.from);
      if (this.options.values) {
        this.result.from_value = this.options.values[this.result.from];
      }
    },
    updateTo: function () {
      this.result.to = this.options.to;
      this.result.to_percent = this.convertToPercent(this.result.to);
      this.result.to_pretty = this._prettify(this.result.to);
      if (this.options.values) {
        this.result.to_value = this.options.values[this.result.to];
      }
    },
    updateResult: function () {
      this.result.min = this.options.min;
      this.result.max = this.options.max;
      this.updateFrom();
      this.updateTo();
    },
    appendGrid: function () {
      if (!this.options.grid) {
        return;
      }
      var o = this.options,
        i,
        z,
        total = o.max - o.min,
        big_num = o.grid_num,
        big_p = 0,
        big_w = 0,
        small_max = 4,
        local_small_max,
        small_p,
        small_w = 0,
        result,
        html = "";
      this.calcGridMargin();
      if (o.grid_snap) {
        big_num = total / o.step;
      }
      if (big_num > 50) big_num = 50;
      big_p = this.toFixed(100 / big_num);
      if (big_num > 4) {
        small_max = 3;
      }
      if (big_num > 7) {
        small_max = 2;
      }
      if (big_num > 14) {
        small_max = 1;
      }
      if (big_num > 28) {
        small_max = 0;
      }
      for (i = 0; i < big_num + 1; i++) {
        local_small_max = small_max;
        big_w = this.toFixed(big_p * i);
        if (big_w > 100) {
          big_w = 100;
        }
        this.coords.big[i] = big_w;
        small_p = (big_w - big_p * (i - 1)) / (local_small_max + 1);
        for (z = 1; z <= local_small_max; z++) {
          if (big_w === 0) {
            break;
          }
          small_w = this.toFixed(big_w - small_p * z);
          html +=
            '<span class="irs-grid-pol small" style="left: ' +
            small_w +
            '%"></span>';
        }
        html +=
          '<span class="irs-grid-pol" style="left: ' + big_w + '%"></span>';
        result = this.convertToValue(big_w);
        if (o.values.length) {
          result = o.p_values[result];
        } else {
          result = this._prettify(result);
        }
        html +=
          '<span class="irs-grid-text js-grid-text-' +
          i +
          '" style="left: ' +
          big_w +
          '%">' +
          result +
          "</span>";
      }
      this.coords.big_num = Math.ceil(big_num + 1);
      this.$cache.cont.addClass("irs-with-grid");
      this.$cache.grid.html(html);
      this.cacheGridLabels();
    },
    cacheGridLabels: function () {
      var $label,
        i,
        num = this.coords.big_num;
      for (i = 0; i < num; i++) {
        $label = this.$cache.grid.find(".js-grid-text-" + i);
        this.$cache.grid_labels.push($label);
      }
      this.calcGridLabels();
    },
    calcGridLabels: function () {
      var i,
        label,
        start = [],
        finish = [],
        num = this.coords.big_num;
      for (i = 0; i < num; i++) {
        this.coords.big_w[i] = this.$cache.grid_labels[i].outerWidth(false);
        this.coords.big_p[i] = this.toFixed(
          (this.coords.big_w[i] / this.coords.w_rs) * 100,
        );
        this.coords.big_x[i] = this.toFixed(this.coords.big_p[i] / 2);
        start[i] = this.toFixed(this.coords.big[i] - this.coords.big_x[i]);
        finish[i] = this.toFixed(start[i] + this.coords.big_p[i]);
      }
      if (this.options.force_edges) {
        if (start[0] < -this.coords.grid_gap) {
          start[0] = -this.coords.grid_gap;
          finish[0] = this.toFixed(start[0] + this.coords.big_p[0]);
          this.coords.big_x[0] = this.coords.grid_gap;
        }
        if (finish[num - 1] > 100 + this.coords.grid_gap) {
          finish[num - 1] = 100 + this.coords.grid_gap;
          start[num - 1] = this.toFixed(
            finish[num - 1] - this.coords.big_p[num - 1],
          );
          this.coords.big_x[num - 1] = this.toFixed(
            this.coords.big_p[num - 1] - this.coords.grid_gap,
          );
        }
      }
      this.calcGridCollision(2, start, finish);
      this.calcGridCollision(4, start, finish);
      for (i = 0; i < num; i++) {
        label = this.$cache.grid_labels[i][0];
        if (this.coords.big_x[i] !== Number.POSITIVE_INFINITY) {
          label.style.marginLeft = -this.coords.big_x[i] + "%";
        }
      }
    },
    calcGridCollision: function (step, start, finish) {
      var i,
        next_i,
        label,
        num = this.coords.big_num;
      for (i = 0; i < num; i += step) {
        next_i = i + step / 2;
        if (next_i >= num) {
          break;
        }
        label = this.$cache.grid_labels[next_i][0];
        if (finish[i] <= start[next_i]) {
          label.style.visibility = "visible";
        } else {
          label.style.visibility = "hidden";
        }
      }
    },
    calcGridMargin: function () {
      if (!this.options.grid_margin) {
        return;
      }
      this.coords.w_rs = this.$cache.rs.outerWidth(false);
      if (!this.coords.w_rs) {
        return;
      }
      if (this.options.type === "single") {
        this.coords.w_handle = this.$cache.s_single.outerWidth(false);
      } else {
        this.coords.w_handle = this.$cache.s_from.outerWidth(false);
      }
      this.coords.p_handle = this.toFixed(
        (this.coords.w_handle / this.coords.w_rs) * 100,
      );
      this.coords.grid_gap = this.toFixed(this.coords.p_handle / 2 - 0.1);
      this.$cache.grid[0].style.width =
        this.toFixed(100 - this.coords.p_handle) + "%";
      this.$cache.grid[0].style.left = this.coords.grid_gap + "%";
    },
    update: function (options) {
      if (!this.input) {
        return;
      }
      this.is_update = true;
      this.options.from = this.result.from;
      this.options.to = this.result.to;
      this.update_check.from = this.result.from;
      this.update_check.to = this.result.to;
      this.options = $.extend(this.options, options);
      this.validate();
      this.updateResult(options);
      this.toggleInput();
      this.remove();
      this.init(true);
    },
    reset: function () {
      if (!this.input) {
        return;
      }
      this.updateResult();
      this.update();
    },
    destroy: function () {
      if (!this.input) {
        return;
      }
      this.toggleInput();
      this.$cache.input.prop("readonly", false);
      $.data(this.input, "ionRangeSlider", null);
      this.remove();
      this.input = null;
      this.options = null;
    },
  };
  $.fn.ionRangeSlider = function (options) {
    return this.each(function () {
      if (!$.data(this, "ionRangeSlider")) {
        $.data(
          this,
          "ionRangeSlider",
          new IonRangeSlider(this, options, plugin_count++),
        );
      }
    });
  };
  (function () {
    var lastTime = 0;
    var vendors = ["ms", "moz", "webkit", "o"];
    for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
      window.requestAnimationFrame =
        window[vendors[x] + "RequestAnimationFrame"];
      window.cancelAnimationFrame =
        window[vendors[x] + "CancelAnimationFrame"] ||
        window[vendors[x] + "CancelRequestAnimationFrame"];
    }
    if (!window.requestAnimationFrame)
      window.requestAnimationFrame = function (callback, element) {
        var currTime = new Date().getTime();
        var timeToCall = Math.max(0, 16 - (currTime - lastTime));
        var id = window.setTimeout(function () {
          callback(currTime + timeToCall);
        }, timeToCall);
        lastTime = currTime + timeToCall;
        return id;
      };
    if (!window.cancelAnimationFrame)
      window.cancelAnimationFrame = function (id) {
        clearTimeout(id);
      };
  })();
});

/* /theme_prime/static/lib/drift-master-1.4.0/dist/Drift.js defined in bundle 'web.assets_frontend_lazy' */
var u =
  "undefined" != typeof window && window === this
    ? this
    : "undefined" != typeof global && null != global
      ? global
      : this;
function v() {
  ((v = function () {}), u.Symbol || (u.Symbol = A));
}
var B = 0;
function A(t) {
  return "jscomp_symbol_" + (t || "") + B++;
}
!(function (t) {
  function i(n) {
    if (e[n]) return e[n].T;
    var s = (e[n] = { ja: n, fa: !1, T: {} });
    return (t[n].call(s.T, s, s.T, i), (s.fa = !0), s.T);
  }
  var e = {};
  ((i.u = t),
    (i.h = e),
    (i.c = function (t, e, n) {
      i.g(t, e) || Object.defineProperty(t, e, { enumerable: !0, get: n });
    }),
    (i.r = function (t) {
      (v(),
        v(),
        "undefined" != typeof Symbol &&
          Symbol.toStringTag &&
          (v(),
          Object.defineProperty(t, Symbol.toStringTag, { value: "Module" })),
        Object.defineProperty(t, "__esModule", { value: !0 }));
    }),
    (i.m = function (t, e) {
      if ((1 & e && (t = i(t)), 8 & e)) return t;
      if (4 & e && "object" == typeof t && t && t.ba) return t;
      var n = Object.create(null);
      if (
        (i.r(n),
        Object.defineProperty(n, "default", { enumerable: !0, value: t }),
        2 & e && "string" != typeof t)
      )
        for (var s in t)
          i.c(
            n,
            s,
            function (i) {
              return t[i];
            }.bind(null, s),
          );
      return n;
    }),
    (i.i = function (t) {
      var e =
        t && t.ba
          ? function () {
              return t.default;
            }
          : function () {
              return t;
            };
      return (i.c(e, "a", e), e);
    }),
    (i.g = function (t, i) {
      return Object.prototype.hasOwnProperty.call(t, i);
    }),
    (i.o = ""),
    i((i.v = 0)));
})([
  function (t, i, e) {
    function n(t, i) {
      if (
        ((i = void 0 === i ? {} : i),
        (this.h = t),
        (this.g = this.g.bind(this)),
        !a(this.h))
      )
        throw new TypeError(
          "`new Drift` requires a DOM element as its first argument.",
        );
      t = i.namespace || null;
      var e = i.showWhitespaceAtEdges || !1,
        n = i.containInline || !1,
        s = i.inlineOffsetX || 0,
        o = i.inlineOffsetY || 0,
        h = i.inlineContainer || document.body,
        r = i.sourceAttribute || "data-zoom",
        d = i.zoomFactor || 3,
        u = void 0 === i.paneContainer ? document.body : i.paneContainer,
        c = i.inlinePane || 375,
        f = !("handleTouch" in i) || !!i.handleTouch,
        p = i.onShow || null,
        l = i.onHide || null,
        b = !("injectBaseStyles" in i) || !!i.injectBaseStyles,
        v = i.hoverDelay || 0,
        m = i.touchDelay || 0,
        y = i.hoverBoundingBox || !1,
        g = i.touchBoundingBox || !1;
      if (((i = i.boundingBoxContainer || document.body), !0 !== c && !a(u)))
        throw new TypeError(
          "`paneContainer` must be a DOM element when `inlinePane !== true`",
        );
      if (!a(h)) throw new TypeError("`inlineContainer` must be a DOM element");
      ((this.a = {
        j: t,
        P: e,
        I: n,
        K: s,
        L: o,
        w: h,
        R: r,
        f: d,
        ga: u,
        ea: c,
        C: f,
        O: p,
        N: l,
        da: b,
        F: v,
        A: m,
        D: y,
        G: g,
        H: i,
      }),
        this.a.da &&
          !document.querySelector(".drift-base-styles") &&
          (((i = document.createElement("style")).type = "text/css"),
          i.classList.add("drift-base-styles"),
          i.appendChild(
            document.createTextNode(
              ".drift-bounding-box,.drift-zoom-pane{position:absolute;pointer-events:none}@keyframes noop{0%{zoom:1}}@-webkit-keyframes noop{0%{zoom:1}}.drift-zoom-pane.drift-open{display:block}.drift-zoom-pane.drift-closing,.drift-zoom-pane.drift-opening{animation:noop 1ms;-webkit-animation:noop 1ms}.drift-zoom-pane{overflow:hidden;width:100%;height:100%;top:0;left:0}.drift-zoom-pane-loader{display:none}.drift-zoom-pane img{position:absolute;display:block;max-width:none;max-height:none}",
            ),
          ),
          (t = document.head).insertBefore(i, t.firstChild)),
        this.v(),
        this.u());
    }
    function s(t) {
      ((t = void 0 === t ? {} : t),
        (this.h = this.h.bind(this)),
        (this.g = this.g.bind(this)),
        (this.m = this.m.bind(this)),
        (this.s = !1));
      var i = void 0 === t.J ? null : t.J,
        e = void 0 === t.f ? c() : t.f,
        n = void 0 === t.U ? c() : t.U,
        s = void 0 === t.j ? null : t.j,
        o = void 0 === t.P ? c() : t.P,
        h = void 0 === t.I ? c() : t.I;
      ((this.a = {
        J: i,
        f: e,
        U: n,
        j: s,
        P: o,
        I: h,
        K: void 0 === t.K ? 0 : t.K,
        L: void 0 === t.L ? 0 : t.L,
        w: void 0 === t.w ? document.body : t.w,
      }),
        (this.o = this.i("open")),
        (this.Y = this.i("opening")),
        (this.u = this.i("closing")),
        (this.v = this.i("inline")),
        (this.V = this.i("loading")),
        this.ha());
    }
    function o(t) {
      ((t = void 0 === t ? {} : t),
        (this.m = this.m.bind(this)),
        (this.B = this.B.bind(this)),
        (this.g = this.g.bind(this)),
        (this.c = this.c.bind(this)));
      var i = t;
      t = void 0 === i.b ? c() : i.b;
      var e = void 0 === i.l ? c() : i.l,
        n = void 0 === i.R ? c() : i.R,
        s = void 0 === i.C ? c() : i.C,
        o = void 0 === i.O ? null : i.O,
        a = void 0 === i.N ? null : i.N,
        r = void 0 === i.F ? 0 : i.F,
        d = void 0 === i.A ? 0 : i.A,
        u = void 0 === i.D ? c() : i.D,
        f = void 0 === i.G ? c() : i.G,
        p = void 0 === i.j ? null : i.j,
        l = void 0 === i.f ? c() : i.f;
      ((i = void 0 === i.H ? c() : i.H),
        (this.a = {
          b: t,
          l: e,
          R: n,
          C: s,
          O: o,
          N: a,
          F: r,
          A: d,
          D: u,
          G: f,
          j: p,
          f: l,
          H: i,
        }),
        (this.a.D || this.a.G) &&
          (this.o = new h({ j: this.a.j, f: this.a.f, S: this.a.H })),
        (this.enabled = !0),
        this.M());
    }
    function h(t) {
      this.s = !1;
      var i = void 0 === t.j ? null : t.j,
        e = void 0 === t.f ? c() : t.f;
      ((t = void 0 === t.S ? c() : t.S),
        (this.a = { j: i, f: e, S: t }),
        (this.c = this.g("open")),
        this.h());
    }
    function a(t) {
      return f
        ? t instanceof HTMLElement
        : t &&
            "object" == typeof t &&
            null !== t &&
            1 === t.nodeType &&
            "string" == typeof t.nodeName;
    }
    function r(t, i) {
      i.forEach(function (i) {
        t.classList.add(i);
      });
    }
    function d(t, i) {
      i.forEach(function (i) {
        t.classList.remove(i);
      });
    }
    function c() {
      throw Error("Missing parameter");
    }
    e.r(i);
    var f = "object" == typeof HTMLElement;
    ((h.prototype.g = function (t) {
      var i = ["drift-" + t],
        e = this.a.j;
      return (e && i.push(e + "-" + t), i);
    }),
      (h.prototype.h = function () {
        ((this.b = document.createElement("div")),
          r(this.b, this.g("bounding-box")));
      }),
      (h.prototype.show = function (t, i) {
        ((this.s = !0), this.a.S.appendChild(this.b));
        var e = this.b.style;
        ((e.width = Math.round(t / this.a.f) + "px"),
          (e.height = Math.round(i / this.a.f) + "px"),
          r(this.b, this.c));
      }),
      (h.prototype.W = function () {
        (this.s && this.a.S.removeChild(this.b),
          (this.s = !1),
          d(this.b, this.c));
      }),
      (h.prototype.setPosition = function (t, i, e) {
        var n = window.pageXOffset,
          s = window.pageYOffset;
        ((t = e.left + t * e.width - this.b.clientWidth / 2 + n),
          (i = e.top + i * e.height - this.b.clientHeight / 2 + s),
          t < e.left + n
            ? (t = e.left + n)
            : t + this.b.clientWidth > e.left + e.width + n &&
              (t = e.left + e.width - this.b.clientWidth + n),
          i < e.top + s
            ? (i = e.top + s)
            : i + this.b.clientHeight > e.top + e.height + s &&
              (i = e.top + e.height - this.b.clientHeight + s),
          (this.b.style.left = t + "px"),
          (this.b.style.top = i + "px"));
      }),
      (o.prototype.i = function (t) {
        t.preventDefault();
      }),
      (o.prototype.u = function (t) {
        (this.a.A && this.V(t) && !this.s) || t.preventDefault();
      }),
      (o.prototype.V = function (t) {
        return !!t.touches;
      }),
      (o.prototype.M = function () {
        (this.a.b.addEventListener("mouseenter", this.g, !1),
          this.a.b.addEventListener("mouseleave", this.B, !1),
          this.a.b.addEventListener("mousemove", this.c, !1),
          this.a.C
            ? (this.a.b.addEventListener("touchstart", this.g, !1),
              this.a.b.addEventListener("touchend", this.B, !1),
              this.a.b.addEventListener("touchmove", this.c, !1))
            : (this.a.b.addEventListener("touchstart", this.i, !1),
              this.a.b.addEventListener("touchend", this.i, !1),
              this.a.b.addEventListener("touchmove", this.i, !1)));
      }),
      (o.prototype.ca = function () {
        (this.a.b.removeEventListener("mouseenter", this.g, !1),
          this.a.b.removeEventListener("mouseleave", this.B, !1),
          this.a.b.removeEventListener("mousemove", this.c, !1),
          this.a.C
            ? (this.a.b.removeEventListener("touchstart", this.g, !1),
              this.a.b.removeEventListener("touchend", this.B, !1),
              this.a.b.removeEventListener("touchmove", this.c, !1))
            : (this.a.b.removeEventListener("touchstart", this.i, !1),
              this.a.b.removeEventListener("touchend", this.i, !1),
              this.a.b.removeEventListener("touchmove", this.i, !1)));
      }),
      (o.prototype.g = function (t) {
        (this.u(t),
          (this.h = t),
          "mouseenter" == t.type && this.a.F
            ? (this.v = setTimeout(this.m, this.a.F))
            : this.a.A
              ? (this.v = setTimeout(this.m, this.a.A))
              : this.m());
      }),
      (o.prototype.m = function () {
        if (this.enabled) {
          var t = this.a.O;
          (t && "function" == typeof t && t(),
            this.a.l.show(
              this.a.b.getAttribute(this.a.R),
              this.a.b.clientWidth,
              this.a.b.clientHeight,
            ),
            this.h &&
              (((t = this.h.touches) && this.a.G) || (!t && this.a.D)) &&
              this.o.show(this.a.l.b.clientWidth, this.a.l.b.clientHeight),
            this.c());
        }
      }),
      (o.prototype.B = function (t) {
        (t && this.u(t),
          (this.h = null),
          this.v && clearTimeout(this.v),
          this.o && this.o.W(),
          (t = this.a.N) && "function" == typeof t && t(),
          this.a.l.W());
      }),
      (o.prototype.c = function (t) {
        if (t) (this.u(t), (this.h = t));
        else {
          if (!this.h) return;
          t = this.h;
        }
        if (t.touches)
          var i = (t = t.touches[0]).clientX,
            e = t.clientY;
        else ((i = t.clientX), (e = t.clientY));
        ((i =
          (i - (t = this.a.b.getBoundingClientRect()).left) /
          this.a.b.clientWidth),
          (e = (e - t.top) / this.a.b.clientHeight),
          this.o && this.o.setPosition(i, e, t),
          this.a.l.setPosition(i, e, t));
      }),
      u.Object.defineProperties(o.prototype, {
        s: {
          configurable: !0,
          enumerable: !0,
          get: function () {
            return this.a.l.s;
          },
        },
      }),
      (t = document.createElement("div").style));
    var p =
      "undefined" != typeof document &&
      ("animation" in t || "webkitAnimation" in t);
    ((s.prototype.i = function (t) {
      var i = ["drift-" + t],
        e = this.a.j;
      return (e && i.push(e + "-" + t), i);
    }),
      (s.prototype.ha = function () {
        ((this.b = document.createElement("div")),
          r(this.b, this.i("zoom-pane")));
        var t = document.createElement("div");
        (r(t, this.i("zoom-pane-loader")),
          this.b.appendChild(t),
          (this.c = document.createElement("img")),
          this.b.appendChild(this.c));
      }),
      (s.prototype.X = function (t) {
        this.c.setAttribute("src", t);
      }),
      (s.prototype.Z = function (t, i) {
        ((this.c.style.width = t * this.a.f + "px"),
          (this.c.style.height = i * this.a.f + "px"));
      }),
      (s.prototype.setPosition = function (t, i, e) {
        var n = this.c.offsetWidth,
          s = this.c.offsetHeight,
          o = this.b.offsetWidth,
          h = this.b.offsetHeight,
          a = o / 2 - n * t,
          r = h / 2 - s * i,
          d = o - n,
          u = h - s,
          c = 0 < d,
          f = 0 < u;
        ((s = c ? d / 2 : 0),
          (n = f ? u / 2 : 0),
          (d = c ? d / 2 : d),
          (u = f ? u / 2 : u),
          this.b.parentElement === this.a.w &&
            ((f = window.pageXOffset),
            (c = window.pageYOffset),
            (t = e.left + t * e.width - o / 2 + this.a.K + f),
            (i = e.top + i * e.height - h / 2 + this.a.L + c),
            this.a.I &&
              (t < e.left + f
                ? (t = e.left + f)
                : t + o > e.left + e.width + f &&
                  (t = e.left + e.width - o + f),
              i < e.top + c
                ? (i = e.top + c)
                : i + h > e.top + e.height + c &&
                  (i = e.top + e.height - h + c)),
            (this.b.style.left = t + "px"),
            (this.b.style.top = i + "px")),
          this.a.P ||
            (a > s ? (a = s) : a < d && (a = d),
            r > n ? (r = n) : r < u && (r = u)),
          (this.c.style.transform = "translate(" + a + "px, " + r + "px)"),
          (this.c.style.webkitTransform =
            "translate(" + a + "px, " + r + "px)"));
      }),
      (s.prototype.M = function () {
        (this.b.removeEventListener("animationend", this.h, !1),
          this.b.removeEventListener("animationend", this.g, !1),
          this.b.removeEventListener("webkitAnimationEnd", this.h, !1),
          this.b.removeEventListener("webkitAnimationEnd", this.g, !1),
          d(this.b, this.o),
          d(this.b, this.u));
      }),
      (s.prototype.show = function (t, i, e) {
        (this.M(),
          (this.s = !0),
          r(this.b, this.o),
          this.c.getAttribute("src") != t &&
            (r(this.b, this.V),
            this.c.addEventListener("load", this.m, !1),
            this.X(t)),
          this.Z(i, e),
          this.ia ? this.aa() : this.$(),
          p &&
            (this.b.addEventListener("animationend", this.h, !1),
            this.b.addEventListener("webkitAnimationEnd", this.h, !1),
            r(this.b, this.Y)));
      }),
      (s.prototype.aa = function () {
        (this.a.w.appendChild(this.b), r(this.b, this.v));
      }),
      (s.prototype.$ = function () {
        this.a.J.appendChild(this.b);
      }),
      (s.prototype.W = function () {
        (this.M(),
          (this.s = !1),
          p
            ? (this.b.addEventListener("animationend", this.g, !1),
              this.b.addEventListener("webkitAnimationEnd", this.g, !1),
              r(this.b, this.u))
            : (d(this.b, this.o), d(this.b, this.v)));
      }),
      (s.prototype.h = function () {
        (this.b.removeEventListener("animationend", this.h, !1),
          this.b.removeEventListener("webkitAnimationEnd", this.h, !1),
          d(this.b, this.Y));
      }),
      (s.prototype.g = function () {
        (this.b.removeEventListener("animationend", this.g, !1),
          this.b.removeEventListener("webkitAnimationEnd", this.g, !1),
          d(this.b, this.o),
          d(this.b, this.u),
          d(this.b, this.v),
          this.b.setAttribute("style", ""),
          this.b.parentElement === this.a.J
            ? this.a.J.removeChild(this.b)
            : this.b.parentElement === this.a.w &&
              this.a.w.removeChild(this.b));
      }),
      (s.prototype.m = function () {
        (this.c.removeEventListener("load", this.m, !1), d(this.b, this.V));
      }),
      u.Object.defineProperties(s.prototype, {
        ia: {
          configurable: !0,
          enumerable: !0,
          get: function () {
            var t = this.a.U;
            return !0 === t || ("number" == typeof t && window.innerWidth <= t);
          },
        },
      }),
      (n.prototype.v = function () {
        this.l = new s({
          J: this.a.ga,
          f: this.a.f,
          P: this.a.P,
          I: this.a.I,
          U: this.a.ea,
          j: this.a.j,
          K: this.a.K,
          L: this.a.L,
          w: this.a.w,
        });
      }),
      (n.prototype.u = function () {
        this.c = new o({
          b: this.h,
          l: this.l,
          C: this.a.C,
          O: this.a.O,
          N: this.a.N,
          R: this.a.R,
          F: this.a.F,
          A: this.a.A,
          D: this.a.D,
          G: this.a.G,
          j: this.a.j,
          f: this.a.f,
          H: this.a.H,
        });
      }),
      (n.prototype.M = function (t) {
        this.l.X(t);
      }),
      (n.prototype.i = function () {
        this.c.enabled = !1;
      }),
      (n.prototype.m = function () {
        this.c.enabled = !0;
      }),
      (n.prototype.g = function () {
        (this.c.B(), this.c.ca());
      }),
      u.Object.defineProperties(n.prototype, {
        s: {
          configurable: !0,
          enumerable: !0,
          get: function () {
            return this.l.s;
          },
        },
        f: {
          configurable: !0,
          enumerable: !0,
          get: function () {
            return this.a.f;
          },
          set: function (t) {
            ((this.a.f = t),
              (this.l.a.f = t),
              (this.c.a.f = t),
              (this.o.a.f = t));
          },
        },
      }),
      Object.defineProperty(n.prototype, "isShowing", {
        get: function () {
          return this.s;
        },
      }),
      Object.defineProperty(n.prototype, "zoomFactor", {
        get: function () {
          return this.f;
        },
        set: function (t) {
          this.f = t;
        },
      }),
      (n.prototype.setZoomImageURL = n.prototype.M),
      (n.prototype.disable = n.prototype.i),
      (n.prototype.enable = n.prototype.m),
      (n.prototype.destroy = n.prototype.g),
      (window.Drift = n));
  },
]);

/* /theme_prime/static/src/js/theme_prime.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("theme_prime.frontend", function (require) {
  "use strict";
  require("web.dom_ready");
  var config = require("web.config");
  $('[data-toggle="tooltip"]').tooltip({ delay: { show: 100, hide: 100 } });
  var isMobileTablet = config.device.size_class <= config.device.SIZES.MD;
  if (!isMobileTablet) {
    var $backToTopButton = $(".back-to-top");
    $(window).scroll(function () {
      $(this).scrollTop() > 800
        ? $backToTopButton.fadeIn(400)
        : $backToTopButton.fadeOut(400);
    });
    $backToTopButton.click(function (ev) {
      ev.preventDefault();
      $("html, body").animate({ scrollTop: 0 }, "fast");
      return true;
    });
  }
  if (isMobileTablet) {
    if (!$("footer").length) {
      $(".tp-tablet-hide-bottom-reached").slideUp();
    }
    $(window).scroll(function () {
      if (
        $(window).scrollTop() >=
        $(document).height() - $(window).height() - 100
      ) {
        $(".tp-tablet-hide-bottom-reached").slideUp();
      } else {
        $(".tp-tablet-hide-bottom-reached").slideDown();
      }
    });
  }
  if (!isMobileTablet) {
    var timeOutList = {};
    var SELECTORS = [
      ".tp_preheader .dropdown",
      ".tp_header .dropdown:not(.o_wsale_products_searchbar_form):not(.d_search_categ_dropdown)",
      "header .tp-account-info .dropdown",
      "body:not(.editor_enable) header #top_menu > .nav-item.dropdown",
      "footer .dropdown",
    ].join(",");
    $(document).on("mouseover", SELECTORS, function () {
      var $menu = $(this);
      clearTimeout(timeOutList[$menu.index()]);
      $menu.find("> .dropdown-menu").stop(true, true).delay(200).fadeIn(500);
    });
    $(document).on("mouseout", SELECTORS, function () {
      var $menu = $(this);
      clearTimeout(timeOutList[$menu.index()]);
      $menu.find("> .dropdown-menu").stop(true, true).delay(200).fadeOut(500);
      timeOutList[$menu.index()] = setTimeout(function () {
        $menu.find("> .dropdown-menu").css("display", "");
      }, 710);
    });
  }
});
odoo.define("theme_prime.menu.2", function (require) {
  "use strict";
  var core = require("web.core");
  require("web.dom_ready");
  var $Menu2 = $(".d_custom_menu_2");
  if ($Menu2.length) {
    var lastItem = $(".d_custom_menu_2").find(".nav-item:last");
    if (lastItem.length) {
      lastItem.addClass("ml-auto");
    }
  }
});

/* /theme_prime/static/src/js/theme_prime_sale.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("theme_prime.website_sale", function (require) {
  "use strict";
  require("website_sale.website_sale");
  var publicWidget = require("web.public.widget");
  var core = require("web.core");
  var Mixins = require("droggol_theme_common.mixins");
  var config = require("web.config");
  var isMobileTablet = config.device.size_class <= config.device.SIZES.MD;
  var qweb = core.qweb;
  var _t = core._t;
  var ProductCarouselMixins = Mixins.ProductCarouselMixins;
  publicWidget.registry.WebsiteSale.include({
    _startZoom: function () {},
    _updateProductImage: function (
      $productContainer,
      displayImage,
      productId,
      productTemplateId,
      newCarousel,
      isCombinationPossible,
    ) {
      if (this.$target.hasClass("d_website_sale")) {
        var $carousel = $productContainer.find(
          ".d_shop_product_details_carousel",
        );
        if (window.location.search.indexOf("enable_editor") === -1) {
          var $newCarousel = $(newCarousel);
          $carousel.after($newCarousel);
          $carousel.remove();
          $carousel = $newCarousel;
          $carousel.carousel(0);
          this._startZoom();
          this.trigger_up("widgets_start_request", { $target: $carousel });
          ProductCarouselMixins._updateIDs($productContainer);
        }
        $carousel.toggleClass("css_not_available", !isCombinationPossible);
      } else {
        this._super.apply(this, arguments);
      }
    },
    _onChangeCombination: function (ev, $parent, combination) {
      this._super.apply(this, arguments);
      var $price = $parent.find(".oe_price_h4");
      var $percentage = $parent.find(".tp-off-percentage");
      if (combination.has_discounted_price) {
        var percentage = Math.round(
          ((combination.list_price - combination.price) /
            combination.list_price) *
            100,
        );
        if (percentage) {
          var percentageText = _.str.sprintf(_t("(%d%% OFF)"), percentage);
          if ($percentage.length) {
            $percentage.text(percentageText);
          } else {
            $percentage = $(
              '<small class="tp-off-percentage d-none d-md-inline-block ml-1">' +
                percentageText +
                "</small>",
            );
            $percentage.appendTo($price);
          }
        } else {
          $percentage.remove();
        }
      } else {
        $percentage.remove();
      }
    },
  });
  publicWidget.registry.FilterSidebar = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    events: { "click .tp-filter-sidebar-toggle": "_onClickToggleSidebar" },
    init: function () {
      this._super.apply(this, arguments);
      this.$backdrop = $('<div class="modal-backdrop show"/>');
    },
    _onClickToggleSidebar: function (ev) {
      ev.preventDefault();
      if ($("#products_grid_before").hasClass("open")) {
        this.$backdrop.remove();
        $("#products_grid_before").removeClass(
          "open",
          400,
          "linear",
          function () {
            $("body").removeClass("modal-open");
          },
        );
      } else {
        this.$backdrop.appendTo("body");
        $("#products_grid_before").addClass("open", 400, "linear");
        $("body").addClass("modal-open");
        this.$backdrop.on("click", this._onClickToggleSidebar.bind(this));
      }
      $(".tp-filter-sidebar-item").toggleClass("d-none show");
    },
  });
  publicWidget.registry.DriftZoom = publicWidget.Widget.extend({
    selector: "#o-carousel-product, .d_shop_product_details_carousel",
    disabledInEditableMode: true,
    start: function () {
      if ($(".ecom-zoomable").length) {
        this.images = _.map(this.$(".carousel-item img"), function (el) {
          return new Drift(el, {
            namespace: "tp",
            sourceAttribute: "src",
            paneContainer: el.parentElement,
            zoomFactor: $(".tp-zoom-factor").val() || 3,
            inlineOffsetY: -50,
            touchDelay: 500,
            inlinePane: 992,
          });
        });
      }
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      _.invoke(this.images, "disable");
      this._super.apply(this, arguments);
    },
  });
  publicWidget.registry.ProductRating = publicWidget.Widget.extend({
    xmlDependencies: ["/website_rating/static/src/xml/portal_tools.xml"],
    selector: ".tp_product_rating",
    events: { click: "_onClickProductRating" },
    start: function () {
      var $rating = $(
        qweb.render("website_rating.rating_stars_static", {
          val: Math.round((this.$el.data("rating") / 2) * 100) / 100 || 0,
        }),
      );
      $rating.addClass("d-inline-block");
      $rating.prependTo(this.$el);
      return this._super.apply(this, arguments);
    },
    _onClickProductRating: function () {
      $('.nav-link[href="#tab_product_rating"]').click();
      $("html, body").animate({
        scrollTop: $(".tab_product_details").offset().top,
      });
    },
  });
  publicWidget.registry.Tabs = publicWidget.Widget.extend({
    selector: ".tab_product_details",
    start: function () {
      this.$(".nav-link").removeClass("active");
      this.$(".nav-link:first").addClass("active");
      this.$(".tab-content .tab-pane:first").addClass("active show");
      if (!this.$(".nav-item").length) {
        this.$el.remove();
      }
      return this._super.apply(this, arguments);
    },
  });
  publicWidget.registry.ProductOwlCarousel = publicWidget.Widget.extend({
    selector: ".tp-owl-carousel",
    start: function () {
      var $owlSlider = this.$(".owl-carousel");
      var responsiveParams = {
        0: { items: 1 },
        576: { items: 2 },
        768: { items: 2 },
        992: { items: 2 },
        1200: { items: 3 },
      };
      if (!this.$target.hasClass("tp-has-two-blocks")) {
        _.extend(responsiveParams, {
          768: { items: 3 },
          992: { items: 4 },
          1200: { items: 5 },
        });
      }
      $owlSlider.removeClass("d-none");
      $owlSlider.owlCarousel({
        dots: false,
        margin: 15,
        stagePadding: 5,
        autoplay: true,
        autoplayTimeout: 3000,
        autoplayHoverPause: true,
        rewind: true,
        rtl: _t.database.parameters.direction === "rtl",
        responsive: responsiveParams,
      });
      this.$(".tp-owl-carousel-prev").click(function () {
        $owlSlider.trigger("prev.owl.carousel");
      });
      this.$(".tp-owl-carousel-next").click(function () {
        $owlSlider.trigger("next.owl.carousel");
      });
      return this._super.apply(this, arguments);
    },
  });
  publicWidget.registry.ProductSelectedAttributes = publicWidget.Widget.extend({
    selector: ".tp-product-selected-attributes",
    events: { "click .tp-attribute-remove": "_onClickAttributeRemove" },
    _onClickAttributeRemove: function (ev) {
      var $form = $(".js_attributes");
      if ($(ev.currentTarget).data("id") === "price") {
        $form.find("input[name=min_price]").remove();
        $form.find("input[name=max_price]").remove();
        $form.submit();
      } else {
        var $input = $form.find(
          "input[value=" + $(ev.currentTarget).data("id") + "]",
        );
        $input.prop("checked", false);
        var $select = $form
          .find("option[value=" + $(ev.currentTarget).data("id") + "]")
          .closest("select");
        $select.val("");
        $form.submit();
      }
    },
  });
  publicWidget.registry.DrFilterCollapse = publicWidget.Widget.extend({
    selector: ".tp-sidebar-attribute",
    events: {
      "click .tp-attribute-title.collapsible": "_onClickTitleAttribute",
    },
    _onClickTitleAttribute: function (ev) {
      if ($(ev.currentTarget).hasClass("expand")) {
        $(ev.currentTarget)
          .siblings(".tp-filter-collapse-area")
          .slideUp("fast");
      } else {
        $(ev.currentTarget)
          .siblings(".tp-filter-collapse-area")
          .slideDown("fast");
      }
      $(ev.currentTarget).toggleClass("expand");
    },
  });
  publicWidget.registry.DrFilterSearch = publicWidget.Widget.extend({
    selector: ".tp-filter-search",
    events: { "input input.search": "_onChangeSearch" },
    _onChangeSearch: function (ev) {
      ev.stopPropagation();
      var value = $(ev.currentTarget).val().trim();
      if (value) {
        this.$("li[data-search-term]").addClass("d-none");
        this.$(
          'li[data-search-term*="' + value.toLowerCase() + '"]',
        ).removeClass("d-none");
      } else {
        this.$("li[data-search-term]").removeClass("d-none");
      }
    },
  });
  publicWidget.registry.DrProductDetailFollowup = publicWidget.Widget.extend({
    selector: ".tp-product-detail-followup",
    events: {
      "click .add_to_cart": "_onClickAddToCart",
      "click .product-img": "_onClickImg",
    },
    start: function () {
      var self = this;
      if (!isMobileTablet && $(".tab_product_details").length) {
        var position = $(".tab_product_details").position().top;
        $(window).on(
          "scroll",
          _.throttle(function (ev) {
            var scroll = $(window).scrollTop();
            if (scroll > position) {
              var productID = $('input[name="product_id"]').val();
              var productPrice = $(".product_price .oe_price").text().trim();
              self
                .$(".product-img img")
                .attr(
                  "src",
                  "/web/image/product.product/" + productID + "/image_128",
                );
              self.$(".oe_price").text(productPrice);
              self.$el.fadeIn();
            } else {
              self.$el.fadeOut();
            }
          }, 20),
        );
      }
    },
    _onClickAddToCart: function (ev) {
      ev.preventDefault();
      var $btn = $("#add_to_cart");
      if ($("#add_to_cart").hasClass("out_of_stock")) {
        return this.displayNotification({
          type: "danger",
          title: _t("No quantity available"),
          message: _t("Can not add product in cart. No quantity available."),
          sticky: false,
        });
      } else {
        $btn.click();
      }
    },
    _onClickImg: function (ev) {
      ev.preventDefault();
      $("html, body").animate({ scrollTop: 0 }, "fast");
    },
  });
  publicWidget.registry.ProductPriceSlider = publicWidget.Widget.extend({
    selector: ".tp-product-price-filter",
    events: {
      "change input[name=min_price]": "_onChangePrice",
      "change input[name=max_price]": "_onChangePrice",
    },
    start: function () {
      var self = this;
      this.$(".tp-product-price-slider").ionRangeSlider({
        skin: "square",
        prettify_separator: ",",
        type: "double",
        hide_from_to: true,
        onChange: function (ev) {
          self.$("input[name=min_price]").val(ev.from);
          self.$("input[name=max_price]").val(ev.to);
          self.$(".tp-price-validate").text("");
          self.$("[type=submit]").removeClass("d-none");
        },
      });
      this.priceFilterSlider = this.$(".tp-product-price-slider").data(
        "ionRangeSlider",
      );
      return this._super.apply(this, arguments);
    },
    _onChangePrice: function (ev) {
      ev.preventDefault();
      var minValue = this.$("input[name=min_price]").val();
      var maxValue = this.$("input[name=max_price]").val();
      if (isNaN(minValue) || isNaN(maxValue)) {
        this.$(".tp-price-validate").text(_t("Enter valid price value"));
        this.$("[type=submit]").addClass("d-none");
        return false;
      }
      if (parseInt(minValue) > parseInt(maxValue)) {
        this.$(".tp-price-validate").text(
          _t("Max price should be greater than min price"),
        );
        this.$("[type=submit]").addClass("d-none");
        return false;
      }
      this.priceFilterSlider.update({ from: minValue, to: maxValue });
      this.$(".tp-price-validate").text("");
      this.$("[type=submit]").removeClass("d-none");
      return false;
    },
  });
});
odoo.define("theme_prime.search_popover", function (require) {
  "use strict";
  require("website_sale.website_sale");
  var publicWidget = require("web.public.widget");
  var core = require("web.core");
  var QWeb = core.qweb;
  publicWidget.registry.searchPopover = publicWidget.Widget.extend({
    selector: ".tp-search-popover",
    xmlDependencies: ["/theme_prime/static/src/xml/theme_prime.xml"],
    events: { click: "_onClickSearchPopover" },
    willStart: function () {
      var self = this;
      var sup_def = this._super.apply(this, arguments);
      var categ_def = this._rpc({
        route: "/droggol_theme_common/get_website_category",
      }).then(function (result) {
        self.categories = result;
      });
      return Promise.all([sup_def, categ_def]);
    },
    _onClickSearchPopover: function (ev) {
      ev.preventDefault();
      if (!QWeb.templates["theme_prime.SearchPopover"]) {
        return;
      }
      var self = this;
      if (this.$searchPopover && this.$searchPopover.length) {
        this.$searchPopover.remove();
        this.$searchPopover = undefined;
        $("#wrapwrap").removeClass("tp-open-search-popover");
      } else {
        $("#wrapwrap").addClass("tp-open-search-popover");
        this.$searchPopover = $(
          QWeb.render("theme_prime.SearchPopover", {
            drg_categories: this.categories,
          }),
        ).appendTo("body");
        this.$searchPopover.find("input").focus();
        this.$searchPopover.on(
          "click",
          ".tp-search-box-close-btn",
          function () {
            self.$searchPopover.remove();
            self.$searchPopover = undefined;
            $("#wrapwrap").removeClass("tp-open-search-popover");
          },
        );
        this.trigger_up("widgets_start_request", {
          $target: this.$searchPopover.find(".o_wsale_products_searchbar_form"),
        });
      }
    },
  });
  publicWidget.registry.productsSearchBar.include({
    events: _.extend(
      {},
      publicWidget.registry.productsSearchBar.prototype.events,
      {
        "click .d_search_categ_dropdown .dropdown-item": "_onCategoryChange",
        "click .d_search_categ_dropdown": "_onClickDropDown",
      },
    ),
    _onClickDropDown: function (ev) {
      this._render();
    },
    _onCategoryChange: function (ev) {
      ev.preventDefault();
      var $item = $(ev.currentTarget);
      this.category_id = $item.data("id") || false;
      this.$(".dr_active_text").text($item.text());
      var actionURL = "/shop";
      if (this.category_id) {
        actionURL = _.str.sprintf("/shop/category/%s", this.category_id);
      }
      this.$el.attr("action", actionURL);
    },
    _fetch: function () {
      var options = {
        order: this.order,
        limit: this.limit,
        display_description: this.displayDescription,
        display_price: this.displayPrice,
        max_nb_chars: Math.round(
          Math.max(this.autocompleteMinWidth, parseInt(this.$el.width())) *
            0.22,
        ),
      };
      if (this.category_id) {
        options["category"] = this.category_id;
      }
      return this._rpc({
        route: "/shop/products/autocomplete",
        params: { term: this.$input.val(), options: options },
      });
    },
    _onInput: function (ev) {
      if (!$(ev.currentTarget).val()) {
        this._render();
        return;
      } else {
        this._super.apply(this, arguments);
      }
    },
  });
});
odoo.define("theme_prime.website_cart_manager", function (require) {
  "use strict";
  require("website_sale_options.website_sale");
  require("website_sale_stock.VariantMixin");
  var publicWidget = require("web.public.widget");
  var core = require("web.core");
  var QuickViewDialog = require("droggol_theme_common.product_quick_view");
  var wSaleUtils = require("website_sale.utils");
  var CartManagerMixin =
    require("droggol_theme_common.mixins").CartManagerMixin;
  var qweb = core.qweb;
  var _t = core._t;
  publicWidget.registry.WebsiteSale.include(
    _.extend({}, CartManagerMixin, {
      xmlDependencies: (
        publicWidget.registry.WebsiteSale.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/we_sale_snippets/droggol_notification_template.xml",
      ]),
      init: function () {
        this.dr_cart_flow = odoo.session_info.dr_cart_flow || "default";
        return this._super.apply(this, arguments);
      },
      _onProductReady: function () {
        var self = this;
        if (this._isDefaultCartFLow() || this.isBuyNow) {
          return this._super.apply(this, arguments);
        }
        var variantSelectorNeeded = !this.$form.find('input[name="add_qty"]')
          .length;
        if (variantSelectorNeeded) {
          var dialogOptions = {
            mini: true,
            size: "small",
            add_if_single_variant: true,
          };
          var productID = this.$form.find(".product_template_id").val();
          if (productID) {
            dialogOptions["productID"] = parseInt(productID);
          } else {
            dialogOptions["variantID"] = this.rootProduct.product_id;
          }
          this.QuickViewDialog = new QuickViewDialog(
            this,
            dialogOptions,
          ).open();
          return this.QuickViewDialog;
        }
        return this._customCartSubmit();
      },
      _customCartSubmit: function () {
        var self = this;
        var $drCustomCartFlow = $("<input>", {
          name: "dr_cart_flow",
          type: "hidden",
          value: this.dr_cart_flow || 0,
        });
        this.$form.append($drCustomCartFlow);
        return this.$form.ajaxSubmit({
          dataType: "json",
          success: function (data) {
            if (data) {
              wSaleUtils.updateCartNavBar(data);
            }
            self.$el.trigger("dr_close_dialog", {});
            return self._handleCartConfirmation(self.dr_cart_flow, data);
          },
        });
      },
      _isDefaultCartFLow: function () {
        return !_.contains(
          ["side_cart", "dialog", "notification"],
          this.dr_cart_flow,
        );
      },
      _onChangeCombination: function () {
        this._super.apply(this, arguments);
        if (
          this.$el.hasClass("auto-add-product") &&
          this.$("#add_to_cart").hasClass("out_of_stock")
        ) {
          return this.displayNotification({
            type: "danger",
            title: _t("No quantity available"),
            message: _t("Can not add product in cart. No quantity available."),
            sticky: false,
          });
        } else if (this.$el.hasClass("auto-add-product")) {
          this.$("#add_to_cart").click();
        }
      },
      _onModalSubmit: function () {
        this.$el.trigger("dr_close_dialog", {});
        this._super.apply(this, arguments);
      },
    }),
  );
});
odoo.define("theme_prime.cart_confirmation_dialog", function (require) {
  "use strict";
  var Dialog = require("web.Dialog");
  return Dialog.extend({
    xmlDependencies: Dialog.prototype.xmlDependencies.concat([
      "/theme_prime/static/src/xml/cart_confirmation_dialog.xml",
    ]),
    template: "theme_prime.cart_confirmation_dialog",
    events: _.extend({}, Dialog.prototype.events, {
      dr_close_dialog: "close",
      "click .d_view_cart": "_openCartSidebar",
      "click .s_d_product_small_block .card": "_onClickProduct",
    }),
    init: function (parent, options) {
      this.data = options.data;
      if (this.data.accessory_product_ids.length) {
        this.data.accessory_product_ids_str = JSON.stringify(
          this.data.accessory_product_ids,
        );
      }
      this._super(
        parent,
        _.extend(
          {
            renderHeader: false,
            renderFooter: false,
            technical: false,
            size: options.size,
            backdrop: true,
          },
          options || {},
        ),
      );
    },
    start: function () {
      var sup = this._super.apply(this, arguments);
      $("<button/>", {
        class: "close",
        "data-dismiss": "modal",
        html: '<i class="lnr lnr-cross"/>',
      }).prependTo(this.$modal.find(".modal-content"));
      this.$modal
        .find(".modal-dialog")
        .addClass(
          "modal-dialog-centered dr_full_dialog d_cart_confirmation_dialog",
        );
      if (this.mini) {
        this.$modal.find(".modal-dialog").addClass("is_mini");
      }
      this.trigger_up("widgets_start_request", {
        $target: this.$(".droggol_product_snippet"),
      });
      return sup;
    },
    _openCartSidebar: function (ev) {
      ev.preventDefault();
      if (!$(".dr_sale_cart_sidebar_container.open").length) {
        if ($(".dr_sale_cart_sidebar:first").length) {
          $(".dr_sale_cart_sidebar:first").trigger("click");
          this.close();
        } else {
          window.location.href = "/shop/cart";
        }
      }
    },
    _onClickProduct: function (ev) {
      window.location.href = $(ev.currentTarget).find(
        ".d-product-name a",
      )[0].href;
    },
  });
});

/* /theme_prime/static/src/js/website_sale_wishlist.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("theme_prime.wishlist", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  require("website_sale_wishlist.wishlist");
  publicWidget.registry.ProductWishlist.include({
    events: _.extend(
      {
        "click .wishlist-section .tp_wish_rm": "_onClickPrimeWishRemove",
        "click .wishlist-section .tp_wish_add": "_onClickPrimeWishAdd",
      },
      publicWidget.registry.ProductWishlist.prototype.events,
    ),
    _onClickPrimeWishAdd: function (ev) {
      var self = this;
      this.$(".wishlist-section .tp_wish_add").addClass("disabled");
      this._primeAddOrMoveWish(ev).then(function () {
        self.$(".wishlist-section .tp_wish_add").removeClass("disabled");
      });
    },
    _onClickPrimeWishRemove: function (ev) {
      this._primeRemoveWish(ev, false);
    },
    _primeAddOrMoveWish: function (e) {
      var $tpWishlistItem = $(e.currentTarget).parents(".tp-wishlist-item");
      var productID = $tpWishlistItem.data("product-id");
      if ($("#b2b_wish").is(":checked")) {
        return this._addToCart(productID, 1);
      } else {
        var adding_deffered = this._addToCart(productID, 1);
        this._primeRemoveWish(e, adding_deffered);
        return adding_deffered;
      }
    },
    _primeRemoveWish: function (e, deferred_redirect) {
      var $tpWishlistItem = $(e.currentTarget).parents(".tp-wishlist-item");
      var productID = $tpWishlistItem.data("product-id");
      var wishID = $tpWishlistItem.data("wish-id");
      var self = this;
      this._rpc({ route: "/shop/wishlist/remove/" + wishID }).then(function () {
        $tpWishlistItem.hide();
      });
      this.wishlistProductIDs = _.without(this.wishlistProductIDs, productID);
      if (this.wishlistProductIDs.length === 0) {
        if (deferred_redirect) {
          deferred_redirect.then(function () {
            self._redirectNoWish();
          });
        }
      }
      this._updateWishlistView();
    },
    _updateWishlistView: function () {
      if (this.wishlistProductIDs.length > 0) {
        $(".o_wsale_my_wish").show();
        $(".my_wish_quantity").text(this.wishlistProductIDs.length);
      } else {
        $(".o_wsale_my_wish").show();
        $(".my_wish_quantity").text("");
      }
      $(".tp-wishlist-counter").text(this.wishlistProductIDs.length);
    },
  });
});

/* /droggol_theme_common/static/lib/OwlCarousel2-2.3.4/dist/owl.carousel.js defined in bundle 'web.assets_frontend_lazy' */
(function ($, window, document, undefined) {
  function Owl(element, options) {
    this.settings = null;
    this.options = $.extend({}, Owl.Defaults, options);
    this.$element = $(element);
    this._handlers = {};
    this._plugins = {};
    this._supress = {};
    this._current = null;
    this._speed = null;
    this._coordinates = [];
    this._breakpoint = null;
    this._width = null;
    this._items = [];
    this._clones = [];
    this._mergers = [];
    this._widths = [];
    this._invalidated = {};
    this._pipe = [];
    this._drag = {
      time: null,
      target: null,
      pointer: null,
      stage: { start: null, current: null },
      direction: null,
    };
    this._states = {
      current: {},
      tags: {
        initializing: ["busy"],
        animating: ["busy"],
        dragging: ["interacting"],
      },
    };
    $.each(
      ["onResize", "onThrottledResize"],
      $.proxy(function (i, handler) {
        this._handlers[handler] = $.proxy(this[handler], this);
      }, this),
    );
    $.each(
      Owl.Plugins,
      $.proxy(function (key, plugin) {
        this._plugins[key.charAt(0).toLowerCase() + key.slice(1)] = new plugin(
          this,
        );
      }, this),
    );
    $.each(
      Owl.Workers,
      $.proxy(function (priority, worker) {
        this._pipe.push({
          filter: worker.filter,
          run: $.proxy(worker.run, this),
        });
      }, this),
    );
    this.setup();
    this.initialize();
  }
  Owl.Defaults = {
    items: 3,
    loop: false,
    center: false,
    rewind: false,
    checkVisibility: true,
    mouseDrag: true,
    touchDrag: true,
    pullDrag: true,
    freeDrag: false,
    margin: 0,
    stagePadding: 0,
    merge: false,
    mergeFit: true,
    autoWidth: false,
    startPosition: 0,
    rtl: false,
    smartSpeed: 250,
    fluidSpeed: false,
    dragEndSpeed: false,
    responsive: {},
    responsiveRefreshRate: 200,
    responsiveBaseElement: window,
    fallbackEasing: "swing",
    slideTransition: "",
    info: false,
    nestedItemSelector: false,
    itemElement: "div",
    stageElement: "div",
    refreshClass: "owl-refresh",
    loadedClass: "owl-loaded",
    loadingClass: "owl-loading",
    rtlClass: "owl-rtl",
    responsiveClass: "owl-responsive",
    dragClass: "owl-drag",
    itemClass: "owl-item",
    stageClass: "owl-stage",
    stageOuterClass: "owl-stage-outer",
    grabClass: "owl-grab",
  };
  Owl.Width = { Default: "default", Inner: "inner", Outer: "outer" };
  Owl.Type = { Event: "event", State: "state" };
  Owl.Plugins = {};
  Owl.Workers = [
    {
      filter: ["width", "settings"],
      run: function () {
        this._width = this.$element.width();
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function (cache) {
        cache.current =
          this._items && this._items[this.relative(this._current)];
      },
    },
    {
      filter: ["items", "settings"],
      run: function () {
        this.$stage.children(".cloned").remove();
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function (cache) {
        var margin = this.settings.margin || "",
          grid = !this.settings.autoWidth,
          rtl = this.settings.rtl,
          css = {
            width: "auto",
            "margin-left": rtl ? margin : "",
            "margin-right": rtl ? "" : margin,
          };
        !grid && this.$stage.children().css(css);
        cache.css = css;
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function (cache) {
        var width =
            (this.width() / this.settings.items).toFixed(3) -
            this.settings.margin,
          merge = null,
          iterator = this._items.length,
          grid = !this.settings.autoWidth,
          widths = [];
        cache.items = { merge: false, width: width };
        while (iterator--) {
          merge = this._mergers[iterator];
          merge =
            (this.settings.mergeFit && Math.min(merge, this.settings.items)) ||
            merge;
          cache.items.merge = merge > 1 || cache.items.merge;
          widths[iterator] = !grid
            ? this._items[iterator].width()
            : width * merge;
        }
        this._widths = widths;
      },
    },
    {
      filter: ["items", "settings"],
      run: function () {
        var clones = [],
          items = this._items,
          settings = this.settings,
          view = Math.max(settings.items * 2, 4),
          size = Math.ceil(items.length / 2) * 2,
          repeat =
            settings.loop && items.length
              ? settings.rewind
                ? view
                : Math.max(view, size)
              : 0,
          append = "",
          prepend = "";
        repeat /= 2;
        while (repeat > 0) {
          clones.push(this.normalize(clones.length / 2, true));
          append = append + items[clones[clones.length - 1]][0].outerHTML;
          clones.push(
            this.normalize(items.length - 1 - (clones.length - 1) / 2, true),
          );
          prepend = items[clones[clones.length - 1]][0].outerHTML + prepend;
          repeat -= 1;
        }
        this._clones = clones;
        $(append).addClass("cloned").appendTo(this.$stage);
        $(prepend).addClass("cloned").prependTo(this.$stage);
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function () {
        var rtl = this.settings.rtl ? 1 : -1,
          size = this._clones.length + this._items.length,
          iterator = -1,
          previous = 0,
          current = 0,
          coordinates = [];
        while (++iterator < size) {
          previous = coordinates[iterator - 1] || 0;
          current =
            this._widths[this.relative(iterator)] + this.settings.margin;
          coordinates.push(previous + current * rtl);
        }
        this._coordinates = coordinates;
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function () {
        var padding = this.settings.stagePadding,
          coordinates = this._coordinates,
          css = {
            width:
              Math.ceil(Math.abs(coordinates[coordinates.length - 1])) +
              padding * 2,
            "padding-left": padding || "",
            "padding-right": padding || "",
          };
        this.$stage.css(css);
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function (cache) {
        var iterator = this._coordinates.length,
          grid = !this.settings.autoWidth,
          items = this.$stage.children();
        if (grid && cache.items.merge) {
          while (iterator--) {
            cache.css.width = this._widths[this.relative(iterator)];
            items.eq(iterator).css(cache.css);
          }
        } else if (grid) {
          cache.css.width = cache.items.width;
          items.css(cache.css);
        }
      },
    },
    {
      filter: ["items"],
      run: function () {
        this._coordinates.length < 1 && this.$stage.removeAttr("style");
      },
    },
    {
      filter: ["width", "items", "settings"],
      run: function (cache) {
        cache.current = cache.current
          ? this.$stage.children().index(cache.current)
          : 0;
        cache.current = Math.max(
          this.minimum(),
          Math.min(this.maximum(), cache.current),
        );
        this.reset(cache.current);
      },
    },
    {
      filter: ["position"],
      run: function () {
        this.animate(this.coordinates(this._current));
      },
    },
    {
      filter: ["width", "position", "items", "settings"],
      run: function () {
        var rtl = this.settings.rtl ? 1 : -1,
          padding = this.settings.stagePadding * 2,
          begin = this.coordinates(this.current()) + padding,
          end = begin + this.width() * rtl,
          inner,
          outer,
          matches = [],
          i,
          n;
        for (i = 0, n = this._coordinates.length; i < n; i++) {
          inner = this._coordinates[i - 1] || 0;
          outer = Math.abs(this._coordinates[i]) + padding * rtl;
          if (
            (this.op(inner, "<=", begin) && this.op(inner, ">", end)) ||
            (this.op(outer, "<", begin) && this.op(outer, ">", end))
          ) {
            matches.push(i);
          }
        }
        this.$stage.children(".active").removeClass("active");
        this.$stage
          .children(":eq(" + matches.join("), :eq(") + ")")
          .addClass("active");
        this.$stage.children(".center").removeClass("center");
        if (this.settings.center) {
          this.$stage.children().eq(this.current()).addClass("center");
        }
      },
    },
  ];
  Owl.prototype.initializeStage = function () {
    this.$stage = this.$element.find("." + this.settings.stageClass);
    if (this.$stage.length) {
      return;
    }
    this.$element.addClass(this.options.loadingClass);
    this.$stage = $("<" + this.settings.stageElement + ">", {
      class: this.settings.stageClass,
    }).wrap($("<div/>", { class: this.settings.stageOuterClass }));
    this.$element.append(this.$stage.parent());
  };
  Owl.prototype.initializeItems = function () {
    var $items = this.$element.find(".owl-item");
    if ($items.length) {
      this._items = $items.get().map(function (item) {
        return $(item);
      });
      this._mergers = this._items.map(function () {
        return 1;
      });
      this.refresh();
      return;
    }
    this.replace(this.$element.children().not(this.$stage.parent()));
    if (this.isVisible()) {
      this.refresh();
    } else {
      this.invalidate("width");
    }
    this.$element
      .removeClass(this.options.loadingClass)
      .addClass(this.options.loadedClass);
  };
  Owl.prototype.initialize = function () {
    this.enter("initializing");
    this.trigger("initialize");
    this.$element.toggleClass(this.settings.rtlClass, this.settings.rtl);
    if (this.settings.autoWidth && !this.is("pre-loading")) {
      var imgs, nestedSelector, width;
      imgs = this.$element.find("img");
      nestedSelector = this.settings.nestedItemSelector
        ? "." + this.settings.nestedItemSelector
        : undefined;
      width = this.$element.children(nestedSelector).width();
      if (imgs.length && width <= 0) {
        this.preloadAutoWidthImages(imgs);
      }
    }
    this.initializeStage();
    this.initializeItems();
    this.registerEventHandlers();
    this.leave("initializing");
    this.trigger("initialized");
  };
  Owl.prototype.isVisible = function () {
    return this.settings.checkVisibility ? this.$element.is(":visible") : true;
  };
  Owl.prototype.setup = function () {
    var viewport = this.viewport(),
      overwrites = this.options.responsive,
      match = -1,
      settings = null;
    if (!overwrites) {
      settings = $.extend({}, this.options);
    } else {
      $.each(overwrites, function (breakpoint) {
        if (breakpoint <= viewport && breakpoint > match) {
          match = Number(breakpoint);
        }
      });
      settings = $.extend({}, this.options, overwrites[match]);
      if (typeof settings.stagePadding === "function") {
        settings.stagePadding = settings.stagePadding();
      }
      delete settings.responsive;
      if (settings.responsiveClass) {
        this.$element.attr(
          "class",
          this.$element
            .attr("class")
            .replace(
              new RegExp("(" + this.options.responsiveClass + "-)\\S+\\s", "g"),
              "$1" + match,
            ),
        );
      }
    }
    this.trigger("change", { property: { name: "settings", value: settings } });
    this._breakpoint = match;
    this.settings = settings;
    this.invalidate("settings");
    this.trigger("changed", {
      property: { name: "settings", value: this.settings },
    });
  };
  Owl.prototype.optionsLogic = function () {
    if (this.settings.autoWidth) {
      this.settings.stagePadding = false;
      this.settings.merge = false;
    }
  };
  Owl.prototype.prepare = function (item) {
    var event = this.trigger("prepare", { content: item });
    if (!event.data) {
      event.data = $("<" + this.settings.itemElement + "/>")
        .addClass(this.options.itemClass)
        .append(item);
    }
    this.trigger("prepared", { content: event.data });
    return event.data;
  };
  Owl.prototype.update = function () {
    var i = 0,
      n = this._pipe.length,
      filter = $.proxy(function (p) {
        return this[p];
      }, this._invalidated),
      cache = {};
    while (i < n) {
      if (
        this._invalidated.all ||
        $.grep(this._pipe[i].filter, filter).length > 0
      ) {
        this._pipe[i].run(cache);
      }
      i++;
    }
    this._invalidated = {};
    !this.is("valid") && this.enter("valid");
  };
  Owl.prototype.width = function (dimension) {
    dimension = dimension || Owl.Width.Default;
    switch (dimension) {
      case Owl.Width.Inner:
      case Owl.Width.Outer:
        return this._width;
      default:
        return (
          this._width - this.settings.stagePadding * 2 + this.settings.margin
        );
    }
  };
  Owl.prototype.refresh = function () {
    this.enter("refreshing");
    this.trigger("refresh");
    this.setup();
    this.optionsLogic();
    this.$element.addClass(this.options.refreshClass);
    this.update();
    this.$element.removeClass(this.options.refreshClass);
    this.leave("refreshing");
    this.trigger("refreshed");
  };
  Owl.prototype.onThrottledResize = function () {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(
      this._handlers.onResize,
      this.settings.responsiveRefreshRate,
    );
  };
  Owl.prototype.onResize = function () {
    if (!this._items.length) {
      return false;
    }
    if (this._width === this.$element.width()) {
      return false;
    }
    if (!this.isVisible()) {
      return false;
    }
    this.enter("resizing");
    if (this.trigger("resize").isDefaultPrevented()) {
      this.leave("resizing");
      return false;
    }
    this.invalidate("width");
    this.refresh();
    this.leave("resizing");
    this.trigger("resized");
  };
  Owl.prototype.registerEventHandlers = function () {
    if ($.support.transition) {
      this.$stage.on(
        $.support.transition.end + ".owl.core",
        $.proxy(this.onTransitionEnd, this),
      );
    }
    if (this.settings.responsive !== false) {
      this.on(window, "resize", this._handlers.onThrottledResize);
    }
    if (this.settings.mouseDrag) {
      this.$element.addClass(this.options.dragClass);
      this.$stage.on("mousedown.owl.core", $.proxy(this.onDragStart, this));
      this.$stage.on("dragstart.owl.core selectstart.owl.core", function () {
        return false;
      });
    }
    if (this.settings.touchDrag) {
      this.$stage.on("touchstart.owl.core", $.proxy(this.onDragStart, this));
      this.$stage.on("touchcancel.owl.core", $.proxy(this.onDragEnd, this));
    }
  };
  Owl.prototype.onDragStart = function (event) {
    var stage = null;
    if (event.which === 3) {
      return;
    }
    if ($.support.transform) {
      stage = this.$stage
        .css("transform")
        .replace(/.*\(|\)| /g, "")
        .split(",");
      stage = {
        x: stage[stage.length === 16 ? 12 : 4],
        y: stage[stage.length === 16 ? 13 : 5],
      };
    } else {
      stage = this.$stage.position();
      stage = {
        x: this.settings.rtl
          ? stage.left +
            this.$stage.width() -
            this.width() +
            this.settings.margin
          : stage.left,
        y: stage.top,
      };
    }
    if (this.is("animating")) {
      $.support.transform ? this.animate(stage.x) : this.$stage.stop();
      this.invalidate("position");
    }
    this.$element.toggleClass(
      this.options.grabClass,
      event.type === "mousedown",
    );
    this.speed(0);
    this._drag.time = new Date().getTime();
    this._drag.target = $(event.target);
    this._drag.stage.start = stage;
    this._drag.stage.current = stage;
    this._drag.pointer = this.pointer(event);
    $(document).on(
      "mouseup.owl.core touchend.owl.core",
      $.proxy(this.onDragEnd, this),
    );
    $(document).one(
      "mousemove.owl.core touchmove.owl.core",
      $.proxy(function (event) {
        var delta = this.difference(this._drag.pointer, this.pointer(event));
        $(document).on(
          "mousemove.owl.core touchmove.owl.core",
          $.proxy(this.onDragMove, this),
        );
        if (Math.abs(delta.x) < Math.abs(delta.y) && this.is("valid")) {
          return;
        }
        event.preventDefault();
        this.enter("dragging");
        this.trigger("drag");
      }, this),
    );
  };
  Owl.prototype.onDragMove = function (event) {
    var minimum = null,
      maximum = null,
      pull = null,
      delta = this.difference(this._drag.pointer, this.pointer(event)),
      stage = this.difference(this._drag.stage.start, delta);
    if (!this.is("dragging")) {
      return;
    }
    event.preventDefault();
    if (this.settings.loop) {
      minimum = this.coordinates(this.minimum());
      maximum = this.coordinates(this.maximum() + 1) - minimum;
      stage.x =
        ((((stage.x - minimum) % maximum) + maximum) % maximum) + minimum;
    } else {
      minimum = this.settings.rtl
        ? this.coordinates(this.maximum())
        : this.coordinates(this.minimum());
      maximum = this.settings.rtl
        ? this.coordinates(this.minimum())
        : this.coordinates(this.maximum());
      pull = this.settings.pullDrag ? (-1 * delta.x) / 5 : 0;
      stage.x = Math.max(Math.min(stage.x, minimum + pull), maximum + pull);
    }
    this._drag.stage.current = stage;
    this.animate(stage.x);
  };
  Owl.prototype.onDragEnd = function (event) {
    var delta = this.difference(this._drag.pointer, this.pointer(event)),
      stage = this._drag.stage.current,
      direction = (delta.x > 0) ^ this.settings.rtl ? "left" : "right";
    $(document).off(".owl.core");
    this.$element.removeClass(this.options.grabClass);
    if ((delta.x !== 0 && this.is("dragging")) || !this.is("valid")) {
      this.speed(this.settings.dragEndSpeed || this.settings.smartSpeed);
      this.current(
        this.closest(stage.x, delta.x !== 0 ? direction : this._drag.direction),
      );
      this.invalidate("position");
      this.update();
      this._drag.direction = direction;
      if (
        Math.abs(delta.x) > 3 ||
        new Date().getTime() - this._drag.time > 300
      ) {
        this._drag.target.one("click.owl.core", function () {
          return false;
        });
      }
    }
    if (!this.is("dragging")) {
      return;
    }
    this.leave("dragging");
    this.trigger("dragged");
  };
  Owl.prototype.closest = function (coordinate, direction) {
    var position = -1,
      pull = 30,
      width = this.width(),
      coordinates = this.coordinates();
    if (!this.settings.freeDrag) {
      $.each(
        coordinates,
        $.proxy(function (index, value) {
          if (
            direction === "left" &&
            coordinate > value - pull &&
            coordinate < value + pull
          ) {
            position = index;
          } else if (
            direction === "right" &&
            coordinate > value - width - pull &&
            coordinate < value - width + pull
          ) {
            position = index + 1;
          } else if (
            this.op(coordinate, "<", value) &&
            this.op(
              coordinate,
              ">",
              coordinates[index + 1] !== undefined
                ? coordinates[index + 1]
                : value - width,
            )
          ) {
            position = direction === "left" ? index + 1 : index;
          }
          return position === -1;
        }, this),
      );
    }
    if (!this.settings.loop) {
      if (this.op(coordinate, ">", coordinates[this.minimum()])) {
        position = coordinate = this.minimum();
      } else if (this.op(coordinate, "<", coordinates[this.maximum()])) {
        position = coordinate = this.maximum();
      }
    }
    return position;
  };
  Owl.prototype.animate = function (coordinate) {
    var animate = this.speed() > 0;
    this.is("animating") && this.onTransitionEnd();
    if (animate) {
      this.enter("animating");
      this.trigger("translate");
    }
    if ($.support.transform3d && $.support.transition) {
      this.$stage.css({
        transform: "translate3d(" + coordinate + "px,0px,0px)",
        transition:
          this.speed() / 1000 +
          "s" +
          (this.settings.slideTransition
            ? " " + this.settings.slideTransition
            : ""),
      });
    } else if (animate) {
      this.$stage.animate(
        { left: coordinate + "px" },
        this.speed(),
        this.settings.fallbackEasing,
        $.proxy(this.onTransitionEnd, this),
      );
    } else {
      this.$stage.css({ left: coordinate + "px" });
    }
  };
  Owl.prototype.is = function (state) {
    return this._states.current[state] && this._states.current[state] > 0;
  };
  Owl.prototype.current = function (position) {
    if (position === undefined) {
      return this._current;
    }
    if (this._items.length === 0) {
      return undefined;
    }
    position = this.normalize(position);
    if (this._current !== position) {
      var event = this.trigger("change", {
        property: { name: "position", value: position },
      });
      if (event.data !== undefined) {
        position = this.normalize(event.data);
      }
      this._current = position;
      this.invalidate("position");
      this.trigger("changed", {
        property: { name: "position", value: this._current },
      });
    }
    return this._current;
  };
  Owl.prototype.invalidate = function (part) {
    if ($.type(part) === "string") {
      this._invalidated[part] = true;
      this.is("valid") && this.leave("valid");
    }
    return $.map(this._invalidated, function (v, i) {
      return i;
    });
  };
  Owl.prototype.reset = function (position) {
    position = this.normalize(position);
    if (position === undefined) {
      return;
    }
    this._speed = 0;
    this._current = position;
    this.suppress(["translate", "translated"]);
    this.animate(this.coordinates(position));
    this.release(["translate", "translated"]);
  };
  Owl.prototype.normalize = function (position, relative) {
    var n = this._items.length,
      m = relative ? 0 : this._clones.length;
    if (!this.isNumeric(position) || n < 1) {
      position = undefined;
    } else if (position < 0 || position >= n + m) {
      position = ((((position - m / 2) % n) + n) % n) + m / 2;
    }
    return position;
  };
  Owl.prototype.relative = function (position) {
    position -= this._clones.length / 2;
    return this.normalize(position, true);
  };
  Owl.prototype.maximum = function (relative) {
    var settings = this.settings,
      maximum = this._coordinates.length,
      iterator,
      reciprocalItemsWidth,
      elementWidth;
    if (settings.loop) {
      maximum = this._clones.length / 2 + this._items.length - 1;
    } else if (settings.autoWidth || settings.merge) {
      iterator = this._items.length;
      if (iterator) {
        reciprocalItemsWidth = this._items[--iterator].width();
        elementWidth = this.$element.width();
        while (iterator--) {
          reciprocalItemsWidth +=
            this._items[iterator].width() + this.settings.margin;
          if (reciprocalItemsWidth > elementWidth) {
            break;
          }
        }
      }
      maximum = iterator + 1;
    } else if (settings.center) {
      maximum = this._items.length - 1;
    } else {
      maximum = this._items.length - settings.items;
    }
    if (relative) {
      maximum -= this._clones.length / 2;
    }
    return Math.max(maximum, 0);
  };
  Owl.prototype.minimum = function (relative) {
    return relative ? 0 : this._clones.length / 2;
  };
  Owl.prototype.items = function (position) {
    if (position === undefined) {
      return this._items.slice();
    }
    position = this.normalize(position, true);
    return this._items[position];
  };
  Owl.prototype.mergers = function (position) {
    if (position === undefined) {
      return this._mergers.slice();
    }
    position = this.normalize(position, true);
    return this._mergers[position];
  };
  Owl.prototype.clones = function (position) {
    var odd = this._clones.length / 2,
      even = odd + this._items.length,
      map = function (index) {
        return index % 2 === 0 ? even + index / 2 : odd - (index + 1) / 2;
      };
    if (position === undefined) {
      return $.map(this._clones, function (v, i) {
        return map(i);
      });
    }
    return $.map(this._clones, function (v, i) {
      return v === position ? map(i) : null;
    });
  };
  Owl.prototype.speed = function (speed) {
    if (speed !== undefined) {
      this._speed = speed;
    }
    return this._speed;
  };
  Owl.prototype.coordinates = function (position) {
    var multiplier = 1,
      newPosition = position - 1,
      coordinate;
    if (position === undefined) {
      return $.map(
        this._coordinates,
        $.proxy(function (coordinate, index) {
          return this.coordinates(index);
        }, this),
      );
    }
    if (this.settings.center) {
      if (this.settings.rtl) {
        multiplier = -1;
        newPosition = position + 1;
      }
      coordinate = this._coordinates[position];
      coordinate +=
        ((this.width() - coordinate + (this._coordinates[newPosition] || 0)) /
          2) *
        multiplier;
    } else {
      coordinate = this._coordinates[newPosition] || 0;
    }
    coordinate = Math.ceil(coordinate);
    return coordinate;
  };
  Owl.prototype.duration = function (from, to, factor) {
    if (factor === 0) {
      return 0;
    }
    return (
      Math.min(Math.max(Math.abs(to - from), 1), 6) *
      Math.abs(factor || this.settings.smartSpeed)
    );
  };
  Owl.prototype.to = function (position, speed) {
    var current = this.current(),
      revert = null,
      distance = position - this.relative(current),
      direction = (distance > 0) - (distance < 0),
      items = this._items.length,
      minimum = this.minimum(),
      maximum = this.maximum();
    if (this.settings.loop) {
      if (!this.settings.rewind && Math.abs(distance) > items / 2) {
        distance += direction * -1 * items;
      }
      position = current + distance;
      revert = ((((position - minimum) % items) + items) % items) + minimum;
      if (
        revert !== position &&
        revert - distance <= maximum &&
        revert - distance > 0
      ) {
        current = revert - distance;
        position = revert;
        this.reset(current);
      }
    } else if (this.settings.rewind) {
      maximum += 1;
      position = ((position % maximum) + maximum) % maximum;
    } else {
      position = Math.max(minimum, Math.min(maximum, position));
    }
    this.speed(this.duration(current, position, speed));
    this.current(position);
    if (this.isVisible()) {
      this.update();
    }
  };
  Owl.prototype.next = function (speed) {
    speed = speed || false;
    this.to(this.relative(this.current()) + 1, speed);
  };
  Owl.prototype.prev = function (speed) {
    speed = speed || false;
    this.to(this.relative(this.current()) - 1, speed);
  };
  Owl.prototype.onTransitionEnd = function (event) {
    if (event !== undefined) {
      event.stopPropagation();
      if (
        (event.target || event.srcElement || event.originalTarget) !==
        this.$stage.get(0)
      ) {
        return false;
      }
    }
    this.leave("animating");
    this.trigger("translated");
  };
  Owl.prototype.viewport = function () {
    var width;
    if (this.options.responsiveBaseElement !== window) {
      width = $(this.options.responsiveBaseElement).width();
    } else if (window.innerWidth) {
      width = window.innerWidth;
    } else if (
      document.documentElement &&
      document.documentElement.clientWidth
    ) {
      width = document.documentElement.clientWidth;
    } else {
      console.warn("Can not detect viewport width.");
    }
    return width;
  };
  Owl.prototype.replace = function (content) {
    this.$stage.empty();
    this._items = [];
    if (content) {
      content = content instanceof jQuery ? content : $(content);
    }
    if (this.settings.nestedItemSelector) {
      content = content.find("." + this.settings.nestedItemSelector);
    }
    content
      .filter(function () {
        return this.nodeType === 1;
      })
      .each(
        $.proxy(function (index, item) {
          item = this.prepare(item);
          this.$stage.append(item);
          this._items.push(item);
          this._mergers.push(
            item
              .find("[data-merge]")
              .addBack("[data-merge]")
              .attr("data-merge") * 1 || 1,
          );
        }, this),
      );
    this.reset(
      this.isNumeric(this.settings.startPosition)
        ? this.settings.startPosition
        : 0,
    );
    this.invalidate("items");
  };
  Owl.prototype.add = function (content, position) {
    var current = this.relative(this._current);
    position =
      position === undefined
        ? this._items.length
        : this.normalize(position, true);
    content = content instanceof jQuery ? content : $(content);
    this.trigger("add", { content: content, position: position });
    content = this.prepare(content);
    if (this._items.length === 0 || position === this._items.length) {
      this._items.length === 0 && this.$stage.append(content);
      this._items.length !== 0 && this._items[position - 1].after(content);
      this._items.push(content);
      this._mergers.push(
        content
          .find("[data-merge]")
          .addBack("[data-merge]")
          .attr("data-merge") * 1 || 1,
      );
    } else {
      this._items[position].before(content);
      this._items.splice(position, 0, content);
      this._mergers.splice(
        position,
        0,
        content
          .find("[data-merge]")
          .addBack("[data-merge]")
          .attr("data-merge") * 1 || 1,
      );
    }
    this._items[current] && this.reset(this._items[current].index());
    this.invalidate("items");
    this.trigger("added", { content: content, position: position });
  };
  Owl.prototype.remove = function (position) {
    position = this.normalize(position, true);
    if (position === undefined) {
      return;
    }
    this.trigger("remove", {
      content: this._items[position],
      position: position,
    });
    this._items[position].remove();
    this._items.splice(position, 1);
    this._mergers.splice(position, 1);
    this.invalidate("items");
    this.trigger("removed", { content: null, position: position });
  };
  Owl.prototype.preloadAutoWidthImages = function (images) {
    images.each(
      $.proxy(function (i, element) {
        this.enter("pre-loading");
        element = $(element);
        $(new Image())
          .one(
            "load",
            $.proxy(function (e) {
              element.attr("src", e.target.src);
              element.css("opacity", 1);
              this.leave("pre-loading");
              !this.is("pre-loading") &&
                !this.is("initializing") &&
                this.refresh();
            }, this),
          )
          .attr(
            "src",
            element.attr("src") ||
              element.attr("data-src") ||
              element.attr("data-src-retina"),
          );
      }, this),
    );
  };
  Owl.prototype.destroy = function () {
    this.$element.off(".owl.core");
    this.$stage.off(".owl.core");
    $(document).off(".owl.core");
    if (this.settings.responsive !== false) {
      window.clearTimeout(this.resizeTimer);
      this.off(window, "resize", this._handlers.onThrottledResize);
    }
    for (var i in this._plugins) {
      this._plugins[i].destroy();
    }
    this.$stage.children(".cloned").remove();
    this.$stage.unwrap();
    this.$stage.children().contents().unwrap();
    this.$stage.children().unwrap();
    this.$stage.remove();
    this.$element
      .removeClass(this.options.refreshClass)
      .removeClass(this.options.loadingClass)
      .removeClass(this.options.loadedClass)
      .removeClass(this.options.rtlClass)
      .removeClass(this.options.dragClass)
      .removeClass(this.options.grabClass)
      .attr(
        "class",
        this.$element
          .attr("class")
          .replace(
            new RegExp(this.options.responsiveClass + "-\\S+\\s", "g"),
            "",
          ),
      )
      .removeData("owl.carousel");
  };
  Owl.prototype.op = function (a, o, b) {
    var rtl = this.settings.rtl;
    switch (o) {
      case "<":
        return rtl ? a > b : a < b;
      case ">":
        return rtl ? a < b : a > b;
      case ">=":
        return rtl ? a <= b : a >= b;
      case "<=":
        return rtl ? a >= b : a <= b;
      default:
        break;
    }
  };
  Owl.prototype.on = function (element, event, listener, capture) {
    if (element.addEventListener) {
      element.addEventListener(event, listener, capture);
    } else if (element.attachEvent) {
      element.attachEvent("on" + event, listener);
    }
  };
  Owl.prototype.off = function (element, event, listener, capture) {
    if (element.removeEventListener) {
      element.removeEventListener(event, listener, capture);
    } else if (element.detachEvent) {
      element.detachEvent("on" + event, listener);
    }
  };
  Owl.prototype.trigger = function (name, data, namespace, state, enter) {
    var status = { item: { count: this._items.length, index: this.current() } },
      handler = $.camelCase(
        $.grep(["on", name, namespace], function (v) {
          return v;
        })
          .join("-")
          .toLowerCase(),
      ),
      event = $.Event(
        [name, "owl", namespace || "carousel"].join(".").toLowerCase(),
        $.extend({ relatedTarget: this }, status, data),
      );
    if (!this._supress[name]) {
      $.each(this._plugins, function (name, plugin) {
        if (plugin.onTrigger) {
          plugin.onTrigger(event);
        }
      });
      this.register({ type: Owl.Type.Event, name: name });
      this.$element.trigger(event);
      if (this.settings && typeof this.settings[handler] === "function") {
        this.settings[handler].call(this, event);
      }
    }
    return event;
  };
  Owl.prototype.enter = function (name) {
    $.each(
      [name].concat(this._states.tags[name] || []),
      $.proxy(function (i, name) {
        if (this._states.current[name] === undefined) {
          this._states.current[name] = 0;
        }
        this._states.current[name]++;
      }, this),
    );
  };
  Owl.prototype.leave = function (name) {
    $.each(
      [name].concat(this._states.tags[name] || []),
      $.proxy(function (i, name) {
        this._states.current[name]--;
      }, this),
    );
  };
  Owl.prototype.register = function (object) {
    if (object.type === Owl.Type.Event) {
      if (!$.event.special[object.name]) {
        $.event.special[object.name] = {};
      }
      if (!$.event.special[object.name].owl) {
        var _default = $.event.special[object.name]._default;
        $.event.special[object.name]._default = function (e) {
          if (
            _default &&
            _default.apply &&
            (!e.namespace || e.namespace.indexOf("owl") === -1)
          ) {
            return _default.apply(this, arguments);
          }
          return e.namespace && e.namespace.indexOf("owl") > -1;
        };
        $.event.special[object.name].owl = true;
      }
    } else if (object.type === Owl.Type.State) {
      if (!this._states.tags[object.name]) {
        this._states.tags[object.name] = object.tags;
      } else {
        this._states.tags[object.name] = this._states.tags[object.name].concat(
          object.tags,
        );
      }
      this._states.tags[object.name] = $.grep(
        this._states.tags[object.name],
        $.proxy(function (tag, i) {
          return $.inArray(tag, this._states.tags[object.name]) === i;
        }, this),
      );
    }
  };
  Owl.prototype.suppress = function (events) {
    $.each(
      events,
      $.proxy(function (index, event) {
        this._supress[event] = true;
      }, this),
    );
  };
  Owl.prototype.release = function (events) {
    $.each(
      events,
      $.proxy(function (index, event) {
        delete this._supress[event];
      }, this),
    );
  };
  Owl.prototype.pointer = function (event) {
    var result = { x: null, y: null };
    event = event.originalEvent || event || window.event;
    event =
      event.touches && event.touches.length
        ? event.touches[0]
        : event.changedTouches && event.changedTouches.length
          ? event.changedTouches[0]
          : event;
    if (event.pageX) {
      result.x = event.pageX;
      result.y = event.pageY;
    } else {
      result.x = event.clientX;
      result.y = event.clientY;
    }
    return result;
  };
  Owl.prototype.isNumeric = function (number) {
    return !isNaN(parseFloat(number));
  };
  Owl.prototype.difference = function (first, second) {
    return { x: first.x - second.x, y: first.y - second.y };
  };
  $.fn.owlCarousel = function (option) {
    var args = Array.prototype.slice.call(arguments, 1);
    return this.each(function () {
      var $this = $(this),
        data = $this.data("owl.carousel");
      if (!data) {
        data = new Owl(this, typeof option == "object" && option);
        $this.data("owl.carousel", data);
        $.each(
          [
            "next",
            "prev",
            "to",
            "destroy",
            "refresh",
            "replace",
            "add",
            "remove",
          ],
          function (i, event) {
            data.register({ type: Owl.Type.Event, name: event });
            data.$element.on(
              event + ".owl.carousel.core",
              $.proxy(function (e) {
                if (e.namespace && e.relatedTarget !== this) {
                  this.suppress([event]);
                  data[event].apply(this, [].slice.call(arguments, 1));
                  this.release([event]);
                }
              }, data),
            );
          },
        );
      }
      if (typeof option == "string" && option.charAt(0) !== "_") {
        data[option].apply(data, args);
      }
    });
  };
  $.fn.owlCarousel.Constructor = Owl;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var AutoRefresh = function (carousel) {
    this._core = carousel;
    this._interval = null;
    this._visible = null;
    this._handlers = {
      "initialized.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.autoRefresh) {
          this.watch();
        }
      }, this),
    };
    this._core.options = $.extend({}, AutoRefresh.Defaults, this._core.options);
    this._core.$element.on(this._handlers);
  };
  AutoRefresh.Defaults = { autoRefresh: true, autoRefreshInterval: 500 };
  AutoRefresh.prototype.watch = function () {
    if (this._interval) {
      return;
    }
    this._visible = this._core.isVisible();
    this._interval = window.setInterval(
      $.proxy(this.refresh, this),
      this._core.settings.autoRefreshInterval,
    );
  };
  AutoRefresh.prototype.refresh = function () {
    if (this._core.isVisible() === this._visible) {
      return;
    }
    this._visible = !this._visible;
    this._core.$element.toggleClass("owl-hidden", !this._visible);
    this._visible && this._core.invalidate("width") && this._core.refresh();
  };
  AutoRefresh.prototype.destroy = function () {
    var handler, property;
    window.clearInterval(this._interval);
    for (handler in this._handlers) {
      this._core.$element.off(handler, this._handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.AutoRefresh = AutoRefresh;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var Lazy = function (carousel) {
    this._core = carousel;
    this._loaded = [];
    this._handlers = {
      "initialized.owl.carousel change.owl.carousel resized.owl.carousel":
        $.proxy(function (e) {
          if (!e.namespace) {
            return;
          }
          if (!this._core.settings || !this._core.settings.lazyLoad) {
            return;
          }
          if (
            (e.property && e.property.name == "position") ||
            e.type == "initialized"
          ) {
            var settings = this._core.settings,
              n =
                (settings.center && Math.ceil(settings.items / 2)) ||
                settings.items,
              i = (settings.center && n * -1) || 0,
              position =
                (e.property && e.property.value !== undefined
                  ? e.property.value
                  : this._core.current()) + i,
              clones = this._core.clones().length,
              load = $.proxy(function (i, v) {
                this.load(v);
              }, this);
            if (settings.lazyLoadEager > 0) {
              n += settings.lazyLoadEager;
              if (settings.loop) {
                position -= settings.lazyLoadEager;
                n++;
              }
            }
            while (i++ < n) {
              this.load(clones / 2 + this._core.relative(position));
              clones &&
                $.each(this._core.clones(this._core.relative(position)), load);
              position++;
            }
          }
        }, this),
    };
    this._core.options = $.extend({}, Lazy.Defaults, this._core.options);
    this._core.$element.on(this._handlers);
  };
  Lazy.Defaults = { lazyLoad: false, lazyLoadEager: 0 };
  Lazy.prototype.load = function (position) {
    var $item = this._core.$stage.children().eq(position),
      $elements = $item && $item.find(".owl-lazy");
    if (!$elements || $.inArray($item.get(0), this._loaded) > -1) {
      return;
    }
    $elements.each(
      $.proxy(function (index, element) {
        var $element = $(element),
          image,
          url =
            (window.devicePixelRatio > 1 && $element.attr("data-src-retina")) ||
            $element.attr("data-src") ||
            $element.attr("data-srcset");
        this._core.trigger("load", { element: $element, url: url }, "lazy");
        if ($element.is("img")) {
          $element
            .one(
              "load.owl.lazy",
              $.proxy(function () {
                $element.css("opacity", 1);
                this._core.trigger(
                  "loaded",
                  { element: $element, url: url },
                  "lazy",
                );
              }, this),
            )
            .attr("src", url);
        } else if ($element.is("source")) {
          $element
            .one(
              "load.owl.lazy",
              $.proxy(function () {
                this._core.trigger(
                  "loaded",
                  { element: $element, url: url },
                  "lazy",
                );
              }, this),
            )
            .attr("srcset", url);
        } else {
          image = new Image();
          image.onload = $.proxy(function () {
            $element.css({
              "background-image": 'url("' + url + '")',
              opacity: "1",
            });
            this._core.trigger(
              "loaded",
              { element: $element, url: url },
              "lazy",
            );
          }, this);
          image.src = url;
        }
      }, this),
    );
    this._loaded.push($item.get(0));
  };
  Lazy.prototype.destroy = function () {
    var handler, property;
    for (handler in this.handlers) {
      this._core.$element.off(handler, this.handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.Lazy = Lazy;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var AutoHeight = function (carousel) {
    this._core = carousel;
    this._previousHeight = null;
    this._handlers = {
      "initialized.owl.carousel refreshed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.autoHeight) {
          this.update();
        }
      }, this),
      "changed.owl.carousel": $.proxy(function (e) {
        if (
          e.namespace &&
          this._core.settings.autoHeight &&
          e.property.name === "position"
        ) {
          this.update();
        }
      }, this),
      "loaded.owl.lazy": $.proxy(function (e) {
        if (
          e.namespace &&
          this._core.settings.autoHeight &&
          e.element.closest("." + this._core.settings.itemClass).index() ===
            this._core.current()
        ) {
          this.update();
        }
      }, this),
    };
    this._core.options = $.extend({}, AutoHeight.Defaults, this._core.options);
    this._core.$element.on(this._handlers);
    this._intervalId = null;
    var refThis = this;
    $(window).on("load", function () {
      if (refThis._core.settings.autoHeight) {
        refThis.update();
      }
    });
    $(window).resize(function () {
      if (refThis._core.settings.autoHeight) {
        if (refThis._intervalId != null) {
          clearTimeout(refThis._intervalId);
        }
        refThis._intervalId = setTimeout(function () {
          refThis.update();
        }, 250);
      }
    });
  };
  AutoHeight.Defaults = { autoHeight: false, autoHeightClass: "owl-height" };
  AutoHeight.prototype.update = function () {
    var start = this._core._current,
      end = start + this._core.settings.items,
      lazyLoadEnabled = this._core.settings.lazyLoad,
      visible = this._core.$stage.children().toArray().slice(start, end),
      heights = [],
      maxheight = 0;
    $.each(visible, function (index, item) {
      heights.push($(item).height());
    });
    maxheight = Math.max.apply(null, heights);
    if (maxheight <= 1 && lazyLoadEnabled && this._previousHeight) {
      maxheight = this._previousHeight;
    }
    this._previousHeight = maxheight;
    this._core.$stage
      .parent()
      .height(maxheight)
      .addClass(this._core.settings.autoHeightClass);
  };
  AutoHeight.prototype.destroy = function () {
    var handler, property;
    for (handler in this._handlers) {
      this._core.$element.off(handler, this._handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] !== "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.AutoHeight = AutoHeight;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var Video = function (carousel) {
    this._core = carousel;
    this._videos = {};
    this._playing = null;
    this._handlers = {
      "initialized.owl.carousel": $.proxy(function (e) {
        if (e.namespace) {
          this._core.register({
            type: "state",
            name: "playing",
            tags: ["interacting"],
          });
        }
      }, this),
      "resize.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.video && this.isInFullScreen()) {
          e.preventDefault();
        }
      }, this),
      "refreshed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.is("resizing")) {
          this._core.$stage.find(".cloned .owl-video-frame").remove();
        }
      }, this),
      "changed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && e.property.name === "position" && this._playing) {
          this.stop();
        }
      }, this),
      "prepared.owl.carousel": $.proxy(function (e) {
        if (!e.namespace) {
          return;
        }
        var $element = $(e.content).find(".owl-video");
        if ($element.length) {
          $element.css("display", "none");
          this.fetch($element, $(e.content));
        }
      }, this),
    };
    this._core.options = $.extend({}, Video.Defaults, this._core.options);
    this._core.$element.on(this._handlers);
    this._core.$element.on(
      "click.owl.video",
      ".owl-video-play-icon",
      $.proxy(function (e) {
        this.play(e);
      }, this),
    );
  };
  Video.Defaults = { video: false, videoHeight: false, videoWidth: false };
  Video.prototype.fetch = function (target, item) {
    var type = (function () {
        if (target.attr("data-vimeo-id")) {
          return "vimeo";
        } else if (target.attr("data-vzaar-id")) {
          return "vzaar";
        } else {
          return "youtube";
        }
      })(),
      id =
        target.attr("data-vimeo-id") ||
        target.attr("data-youtube-id") ||
        target.attr("data-vzaar-id"),
      width = target.attr("data-width") || this._core.settings.videoWidth,
      height = target.attr("data-height") || this._core.settings.videoHeight,
      url = target.attr("href");
    if (url) {
      id = url.match(
        /(http:|https:|)\/\/(player.|www.|app.)?(vimeo\.com|youtu(be\.com|\.be|be\.googleapis\.com|be\-nocookie\.com)|vzaar\.com)\/(video\/|videos\/|embed\/|channels\/.+\/|groups\/.+\/|watch\?v=|v\/)?([A-Za-z0-9._%-]*)(\&\S+)?/,
      );
      if (id[3].indexOf("youtu") > -1) {
        type = "youtube";
      } else if (id[3].indexOf("vimeo") > -1) {
        type = "vimeo";
      } else if (id[3].indexOf("vzaar") > -1) {
        type = "vzaar";
      } else {
        throw new Error("Video URL not supported.");
      }
      id = id[6];
    } else {
      throw new Error("Missing video URL.");
    }
    this._videos[url] = { type: type, id: id, width: width, height: height };
    item.attr("data-video", url);
    this.thumbnail(target, this._videos[url]);
  };
  Video.prototype.thumbnail = function (target, video) {
    var tnLink,
      icon,
      path,
      dimensions =
        video.width && video.height
          ? "width:" + video.width + "px;height:" + video.height + "px;"
          : "",
      customTn = target.find("img"),
      srcType = "src",
      lazyClass = "",
      settings = this._core.settings,
      create = function (path) {
        icon = '<div class="owl-video-play-icon"></div>';
        if (settings.lazyLoad) {
          tnLink = $("<div/>", {
            class: "owl-video-tn " + lazyClass,
            srcType: path,
          });
        } else {
          tnLink = $("<div/>", {
            class: "owl-video-tn",
            style: "opacity:1;background-image:url(" + path + ")",
          });
        }
        target.after(tnLink);
        target.after(icon);
      };
    target.wrap($("<div/>", { class: "owl-video-wrapper", style: dimensions }));
    if (this._core.settings.lazyLoad) {
      srcType = "data-src";
      lazyClass = "owl-lazy";
    }
    if (customTn.length) {
      create(customTn.attr(srcType));
      customTn.remove();
      return false;
    }
    if (video.type === "youtube") {
      path = "//img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
      create(path);
    } else if (video.type === "vimeo") {
      $.ajax({
        type: "GET",
        url: "//vimeo.com/api/v2/video/" + video.id + ".json",
        jsonp: "callback",
        dataType: "jsonp",
        success: function (data) {
          path = data[0].thumbnail_large;
          create(path);
        },
      });
    } else if (video.type === "vzaar") {
      $.ajax({
        type: "GET",
        url: "//vzaar.com/api/videos/" + video.id + ".json",
        jsonp: "callback",
        dataType: "jsonp",
        success: function (data) {
          path = data.framegrab_url;
          create(path);
        },
      });
    }
  };
  Video.prototype.stop = function () {
    this._core.trigger("stop", null, "video");
    this._playing.find(".owl-video-frame").remove();
    this._playing.removeClass("owl-video-playing");
    this._playing = null;
    this._core.leave("playing");
    this._core.trigger("stopped", null, "video");
  };
  Video.prototype.play = function (event) {
    var target = $(event.target),
      item = target.closest("." + this._core.settings.itemClass),
      video = this._videos[item.attr("data-video")],
      width = video.width || "100%",
      height = video.height || this._core.$stage.height(),
      html,
      iframe;
    if (this._playing) {
      return;
    }
    this._core.enter("playing");
    this._core.trigger("play", null, "video");
    item = this._core.items(this._core.relative(item.index()));
    this._core.reset(item.index());
    html = $(
      '<iframe frameborder="0" allowfullscreen mozallowfullscreen webkitAllowFullScreen ></iframe>',
    );
    html.attr("height", height);
    html.attr("width", width);
    if (video.type === "youtube") {
      html.attr(
        "src",
        "//www.youtube.com/embed/" +
          video.id +
          "?autoplay=1&rel=0&v=" +
          video.id,
      );
    } else if (video.type === "vimeo") {
      html.attr("src", "//player.vimeo.com/video/" + video.id + "?autoplay=1");
    } else if (video.type === "vzaar") {
      html.attr(
        "src",
        "//view.vzaar.com/" + video.id + "/player?autoplay=true",
      );
    }
    iframe = $(html)
      .wrap('<div class="owl-video-frame" />')
      .insertAfter(item.find(".owl-video"));
    this._playing = item.addClass("owl-video-playing");
  };
  Video.prototype.isInFullScreen = function () {
    var element =
      document.fullscreenElement ||
      document.mozFullScreenElement ||
      document.webkitFullscreenElement;
    return element && $(element).parent().hasClass("owl-video-frame");
  };
  Video.prototype.destroy = function () {
    var handler, property;
    this._core.$element.off("click.owl.video");
    for (handler in this._handlers) {
      this._core.$element.off(handler, this._handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.Video = Video;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var Animate = function (scope) {
    this.core = scope;
    this.core.options = $.extend({}, Animate.Defaults, this.core.options);
    this.swapping = true;
    this.previous = undefined;
    this.next = undefined;
    this.handlers = {
      "change.owl.carousel": $.proxy(function (e) {
        if (e.namespace && e.property.name == "position") {
          this.previous = this.core.current();
          this.next = e.property.value;
        }
      }, this),
      "drag.owl.carousel dragged.owl.carousel translated.owl.carousel": $.proxy(
        function (e) {
          if (e.namespace) {
            this.swapping = e.type == "translated";
          }
        },
        this,
      ),
      "translate.owl.carousel": $.proxy(function (e) {
        if (
          e.namespace &&
          this.swapping &&
          (this.core.options.animateOut || this.core.options.animateIn)
        ) {
          this.swap();
        }
      }, this),
    };
    this.core.$element.on(this.handlers);
  };
  Animate.Defaults = { animateOut: false, animateIn: false };
  Animate.prototype.swap = function () {
    if (this.core.settings.items !== 1) {
      return;
    }
    if (!$.support.animation || !$.support.transition) {
      return;
    }
    this.core.speed(0);
    var left,
      clear = $.proxy(this.clear, this),
      previous = this.core.$stage.children().eq(this.previous),
      next = this.core.$stage.children().eq(this.next),
      incoming = this.core.settings.animateIn,
      outgoing = this.core.settings.animateOut;
    if (this.core.current() === this.previous) {
      return;
    }
    if (outgoing) {
      left =
        this.core.coordinates(this.previous) - this.core.coordinates(this.next);
      previous
        .one($.support.animation.end, clear)
        .css({ left: left + "px" })
        .addClass("animated owl-animated-out")
        .addClass(outgoing);
    }
    if (incoming) {
      next
        .one($.support.animation.end, clear)
        .addClass("animated owl-animated-in")
        .addClass(incoming);
    }
  };
  Animate.prototype.clear = function (e) {
    $(e.target)
      .css({ left: "" })
      .removeClass("animated owl-animated-out owl-animated-in")
      .removeClass(this.core.settings.animateIn)
      .removeClass(this.core.settings.animateOut);
    this.core.onTransitionEnd();
  };
  Animate.prototype.destroy = function () {
    var handler, property;
    for (handler in this.handlers) {
      this.core.$element.off(handler, this.handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.Animate = Animate;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var Autoplay = function (carousel) {
    this._core = carousel;
    this._call = null;
    this._time = 0;
    this._timeout = 0;
    this._paused = true;
    this._handlers = {
      "changed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && e.property.name === "settings") {
          if (this._core.settings.autoplay) {
            this.play();
          } else {
            this.stop();
          }
        } else if (
          e.namespace &&
          e.property.name === "position" &&
          this._paused
        ) {
          this._time = 0;
        }
      }, this),
      "initialized.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.autoplay) {
          this.play();
        }
      }, this),
      "play.owl.autoplay": $.proxy(function (e, t, s) {
        if (e.namespace) {
          this.play(t, s);
        }
      }, this),
      "stop.owl.autoplay": $.proxy(function (e) {
        if (e.namespace) {
          this.stop();
        }
      }, this),
      "mouseover.owl.autoplay": $.proxy(function () {
        if (
          this._core.settings.autoplayHoverPause &&
          this._core.is("rotating")
        ) {
          this.pause();
        }
      }, this),
      "mouseleave.owl.autoplay": $.proxy(function () {
        if (
          this._core.settings.autoplayHoverPause &&
          this._core.is("rotating")
        ) {
          this.play();
        }
      }, this),
      "touchstart.owl.core": $.proxy(function () {
        if (
          this._core.settings.autoplayHoverPause &&
          this._core.is("rotating")
        ) {
          this.pause();
        }
      }, this),
      "touchend.owl.core": $.proxy(function () {
        if (this._core.settings.autoplayHoverPause) {
          this.play();
        }
      }, this),
    };
    this._core.$element.on(this._handlers);
    this._core.options = $.extend({}, Autoplay.Defaults, this._core.options);
  };
  Autoplay.Defaults = {
    autoplay: false,
    autoplayTimeout: 5000,
    autoplayHoverPause: false,
    autoplaySpeed: false,
  };
  Autoplay.prototype._next = function (speed) {
    this._call = window.setTimeout(
      $.proxy(this._next, this, speed),
      this._timeout * (Math.round(this.read() / this._timeout) + 1) -
        this.read(),
    );
    if (this._core.is("interacting") || document.hidden) {
      return;
    }
    this._core.next(speed || this._core.settings.autoplaySpeed);
  };
  Autoplay.prototype.read = function () {
    return new Date().getTime() - this._time;
  };
  Autoplay.prototype.play = function (timeout, speed) {
    var elapsed;
    if (!this._core.is("rotating")) {
      this._core.enter("rotating");
    }
    timeout = timeout || this._core.settings.autoplayTimeout;
    elapsed = Math.min(this._time % (this._timeout || timeout), timeout);
    if (this._paused) {
      this._time = this.read();
      this._paused = false;
    } else {
      window.clearTimeout(this._call);
    }
    this._time += (this.read() % timeout) - elapsed;
    this._timeout = timeout;
    this._call = window.setTimeout(
      $.proxy(this._next, this, speed),
      timeout - elapsed,
    );
  };
  Autoplay.prototype.stop = function () {
    if (this._core.is("rotating")) {
      this._time = 0;
      this._paused = true;
      window.clearTimeout(this._call);
      this._core.leave("rotating");
    }
  };
  Autoplay.prototype.pause = function () {
    if (this._core.is("rotating") && !this._paused) {
      this._time = this.read();
      this._paused = true;
      window.clearTimeout(this._call);
    }
  };
  Autoplay.prototype.destroy = function () {
    var handler, property;
    this.stop();
    for (handler in this._handlers) {
      this._core.$element.off(handler, this._handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.autoplay = Autoplay;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  "use strict";
  var Navigation = function (carousel) {
    this._core = carousel;
    this._initialized = false;
    this._pages = [];
    this._controls = {};
    this._templates = [];
    this.$element = this._core.$element;
    this._overrides = {
      next: this._core.next,
      prev: this._core.prev,
      to: this._core.to,
    };
    this._handlers = {
      "prepared.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.dotsData) {
          this._templates.push(
            '<div class="' +
              this._core.settings.dotClass +
              '">' +
              $(e.content)
                .find("[data-dot]")
                .addBack("[data-dot]")
                .attr("data-dot") +
              "</div>",
          );
        }
      }, this),
      "added.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.dotsData) {
          this._templates.splice(e.position, 0, this._templates.pop());
        }
      }, this),
      "remove.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.dotsData) {
          this._templates.splice(e.position, 1);
        }
      }, this),
      "changed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && e.property.name == "position") {
          this.draw();
        }
      }, this),
      "initialized.owl.carousel": $.proxy(function (e) {
        if (e.namespace && !this._initialized) {
          this._core.trigger("initialize", null, "navigation");
          this.initialize();
          this.update();
          this.draw();
          this._initialized = true;
          this._core.trigger("initialized", null, "navigation");
        }
      }, this),
      "refreshed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._initialized) {
          this._core.trigger("refresh", null, "navigation");
          this.update();
          this.draw();
          this._core.trigger("refreshed", null, "navigation");
        }
      }, this),
    };
    this._core.options = $.extend({}, Navigation.Defaults, this._core.options);
    this.$element.on(this._handlers);
  };
  Navigation.Defaults = {
    nav: false,
    navText: [
      '<span aria-label="' + "Previous" + '">&#x2039;</span>',
      '<span aria-label="' + "Next" + '">&#x203a;</span>',
    ],
    navSpeed: false,
    navElement: 'button type="button" role="presentation"',
    navContainer: false,
    navContainerClass: "owl-nav",
    navClass: ["owl-prev", "owl-next"],
    slideBy: 1,
    dotClass: "owl-dot",
    dotsClass: "owl-dots",
    dots: true,
    dotsEach: false,
    dotsData: false,
    dotsSpeed: false,
    dotsContainer: false,
  };
  Navigation.prototype.initialize = function () {
    var override,
      settings = this._core.settings;
    this._controls.$relative = (
      settings.navContainer
        ? $(settings.navContainer)
        : $("<div>")
            .addClass(settings.navContainerClass)
            .appendTo(this.$element)
    ).addClass("disabled");
    this._controls.$previous = $("<" + settings.navElement + ">")
      .addClass(settings.navClass[0])
      .html(settings.navText[0])
      .prependTo(this._controls.$relative)
      .on(
        "click",
        $.proxy(function (e) {
          this.prev(settings.navSpeed);
        }, this),
      );
    this._controls.$next = $("<" + settings.navElement + ">")
      .addClass(settings.navClass[1])
      .html(settings.navText[1])
      .appendTo(this._controls.$relative)
      .on(
        "click",
        $.proxy(function (e) {
          this.next(settings.navSpeed);
        }, this),
      );
    if (!settings.dotsData) {
      this._templates = [
        $('<button role="button">')
          .addClass(settings.dotClass)
          .append($("<span>"))
          .prop("outerHTML"),
      ];
    }
    this._controls.$absolute = (
      settings.dotsContainer
        ? $(settings.dotsContainer)
        : $("<div>").addClass(settings.dotsClass).appendTo(this.$element)
    ).addClass("disabled");
    this._controls.$absolute.on(
      "click",
      "button",
      $.proxy(function (e) {
        var index = $(e.target).parent().is(this._controls.$absolute)
          ? $(e.target).index()
          : $(e.target).parent().index();
        e.preventDefault();
        this.to(index, settings.dotsSpeed);
      }, this),
    );
    for (override in this._overrides) {
      this._core[override] = $.proxy(this[override], this);
    }
  };
  Navigation.prototype.destroy = function () {
    var handler, control, property, override, settings;
    settings = this._core.settings;
    for (handler in this._handlers) {
      this.$element.off(handler, this._handlers[handler]);
    }
    for (control in this._controls) {
      if (control === "$relative" && settings.navContainer) {
        this._controls[control].html("");
      } else {
        this._controls[control].remove();
      }
    }
    for (override in this.overides) {
      this._core[override] = this._overrides[override];
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  Navigation.prototype.update = function () {
    var i,
      j,
      k,
      lower = this._core.clones().length / 2,
      upper = lower + this._core.items().length,
      maximum = this._core.maximum(true),
      settings = this._core.settings,
      size =
        settings.center || settings.autoWidth || settings.dotsData
          ? 1
          : settings.dotsEach || settings.items;
    if (settings.slideBy !== "page") {
      settings.slideBy = Math.min(settings.slideBy, settings.items);
    }
    if (settings.dots || settings.slideBy == "page") {
      this._pages = [];
      for (i = lower, j = 0, k = 0; i < upper; i++) {
        if (j >= size || j === 0) {
          this._pages.push({
            start: Math.min(maximum, i - lower),
            end: i - lower + size - 1,
          });
          if (Math.min(maximum, i - lower) === maximum) {
            break;
          }
          ((j = 0), ++k);
        }
        j += this._core.mergers(this._core.relative(i));
      }
    }
  };
  Navigation.prototype.draw = function () {
    var difference,
      settings = this._core.settings,
      disabled = this._core.items().length <= settings.items,
      index = this._core.relative(this._core.current()),
      loop = settings.loop || settings.rewind;
    this._controls.$relative.toggleClass("disabled", !settings.nav || disabled);
    if (settings.nav) {
      this._controls.$previous.toggleClass(
        "disabled",
        !loop && index <= this._core.minimum(true),
      );
      this._controls.$next.toggleClass(
        "disabled",
        !loop && index >= this._core.maximum(true),
      );
    }
    this._controls.$absolute.toggleClass(
      "disabled",
      !settings.dots || disabled,
    );
    if (settings.dots) {
      difference =
        this._pages.length - this._controls.$absolute.children().length;
      if (settings.dotsData && difference !== 0) {
        this._controls.$absolute.html(this._templates.join(""));
      } else if (difference > 0) {
        this._controls.$absolute.append(
          new Array(difference + 1).join(this._templates[0]),
        );
      } else if (difference < 0) {
        this._controls.$absolute.children().slice(difference).remove();
      }
      this._controls.$absolute.find(".active").removeClass("active");
      this._controls.$absolute
        .children()
        .eq($.inArray(this.current(), this._pages))
        .addClass("active");
    }
  };
  Navigation.prototype.onTrigger = function (event) {
    var settings = this._core.settings;
    event.page = {
      index: $.inArray(this.current(), this._pages),
      count: this._pages.length,
      size:
        settings &&
        (settings.center || settings.autoWidth || settings.dotsData
          ? 1
          : settings.dotsEach || settings.items),
    };
  };
  Navigation.prototype.current = function () {
    var current = this._core.relative(this._core.current());
    return $.grep(
      this._pages,
      $.proxy(function (page, index) {
        return page.start <= current && page.end >= current;
      }, this),
    ).pop();
  };
  Navigation.prototype.getPosition = function (successor) {
    var position,
      length,
      settings = this._core.settings;
    if (settings.slideBy == "page") {
      position = $.inArray(this.current(), this._pages);
      length = this._pages.length;
      successor ? ++position : --position;
      position = this._pages[((position % length) + length) % length].start;
    } else {
      position = this._core.relative(this._core.current());
      length = this._core.items().length;
      successor
        ? (position += settings.slideBy)
        : (position -= settings.slideBy);
    }
    return position;
  };
  Navigation.prototype.next = function (speed) {
    $.proxy(this._overrides.to, this._core)(this.getPosition(true), speed);
  };
  Navigation.prototype.prev = function (speed) {
    $.proxy(this._overrides.to, this._core)(this.getPosition(false), speed);
  };
  Navigation.prototype.to = function (position, speed, standard) {
    var length;
    if (!standard && this._pages.length) {
      length = this._pages.length;
      $.proxy(this._overrides.to, this._core)(
        this._pages[((position % length) + length) % length].start,
        speed,
      );
    } else {
      $.proxy(this._overrides.to, this._core)(position, speed);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.Navigation = Navigation;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  "use strict";
  var Hash = function (carousel) {
    this._core = carousel;
    this._hashes = {};
    this.$element = this._core.$element;
    this._handlers = {
      "initialized.owl.carousel": $.proxy(function (e) {
        if (e.namespace && this._core.settings.startPosition === "URLHash") {
          $(window).trigger("hashchange.owl.navigation");
        }
      }, this),
      "prepared.owl.carousel": $.proxy(function (e) {
        if (e.namespace) {
          var hash = $(e.content)
            .find("[data-hash]")
            .addBack("[data-hash]")
            .attr("data-hash");
          if (!hash) {
            return;
          }
          this._hashes[hash] = e.content;
        }
      }, this),
      "changed.owl.carousel": $.proxy(function (e) {
        if (e.namespace && e.property.name === "position") {
          var current = this._core.items(
              this._core.relative(this._core.current()),
            ),
            hash = $.map(this._hashes, function (item, hash) {
              return item === current ? hash : null;
            }).join();
          if (!hash || window.location.hash.slice(1) === hash) {
            return;
          }
          window.location.hash = hash;
        }
      }, this),
    };
    this._core.options = $.extend({}, Hash.Defaults, this._core.options);
    this.$element.on(this._handlers);
    $(window).on(
      "hashchange.owl.navigation",
      $.proxy(function (e) {
        var hash = window.location.hash.substring(1),
          items = this._core.$stage.children(),
          position = this._hashes[hash] && items.index(this._hashes[hash]);
        if (position === undefined || position === this._core.current()) {
          return;
        }
        this._core.to(this._core.relative(position), false, true);
      }, this),
    );
  };
  Hash.Defaults = { URLhashListener: false };
  Hash.prototype.destroy = function () {
    var handler, property;
    $(window).off("hashchange.owl.navigation");
    for (handler in this._handlers) {
      this._core.$element.off(handler, this._handlers[handler]);
    }
    for (property in Object.getOwnPropertyNames(this)) {
      typeof this[property] != "function" && (this[property] = null);
    }
  };
  $.fn.owlCarousel.Constructor.Plugins.Hash = Hash;
})(window.Zepto || window.jQuery, window, document);
(function ($, window, document, undefined) {
  var style = $("<support>").get(0).style,
    prefixes = "Webkit Moz O ms".split(" "),
    events = {
      transition: {
        end: {
          WebkitTransition: "webkitTransitionEnd",
          MozTransition: "transitionend",
          OTransition: "oTransitionEnd",
          transition: "transitionend",
        },
      },
      animation: {
        end: {
          WebkitAnimation: "webkitAnimationEnd",
          MozAnimation: "animationend",
          OAnimation: "oAnimationEnd",
          animation: "animationend",
        },
      },
    },
    tests = {
      csstransforms: function () {
        return !!test("transform");
      },
      csstransforms3d: function () {
        return !!test("perspective");
      },
      csstransitions: function () {
        return !!test("transition");
      },
      cssanimations: function () {
        return !!test("animation");
      },
    };
  function test(property, prefixed) {
    var result = false,
      upper = property.charAt(0).toUpperCase() + property.slice(1);
    $.each(
      (property + " " + prefixes.join(upper + " ") + upper).split(" "),
      function (i, property) {
        if (style[property] !== undefined) {
          result = prefixed ? property : true;
          return false;
        }
      },
    );
    return result;
  }
  function prefixed(property) {
    return test(property, true);
  }
  if (tests.csstransitions()) {
    $.support.transition = new String(prefixed("transition"));
    $.support.transition.end = events.transition.end[$.support.transition];
  }
  if (tests.cssanimations()) {
    $.support.animation = new String(prefixed("animation"));
    $.support.animation.end = events.animation.end[$.support.animation];
  }
  if (tests.csstransforms()) {
    $.support.transform = new String(prefixed("transform"));
    $.support.transform3d = tests.csstransforms3d();
  }
})(window.Zepto || window.jQuery, window, document);

/* /droggol_theme_common/static/lib/PhotoSwipe-4.1.3/dist/photoswipe.js defined in bundle 'web.assets_frontend_lazy' */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory);
  } else if (typeof exports === "object") {
    module.exports = factory();
  } else {
    root.PhotoSwipe = factory();
  }
})(this, function () {
  "use strict";
  var PhotoSwipe = function (template, UiClass, items, options) {
    var framework = {
      features: null,
      bind: function (target, type, listener, unbind) {
        var methodName = (unbind ? "remove" : "add") + "EventListener";
        type = type.split(" ");
        for (var i = 0; i < type.length; i++) {
          if (type[i]) {
            target[methodName](type[i], listener, false);
          }
        }
      },
      isArray: function (obj) {
        return obj instanceof Array;
      },
      createEl: function (classes, tag) {
        var el = document.createElement(tag || "div");
        if (classes) {
          el.className = classes;
        }
        return el;
      },
      getScrollY: function () {
        var yOffset = window.pageYOffset;
        return yOffset !== undefined
          ? yOffset
          : document.documentElement.scrollTop;
      },
      unbind: function (target, type, listener) {
        framework.bind(target, type, listener, true);
      },
      removeClass: function (el, className) {
        var reg = new RegExp("(\\s|^)" + className + "(\\s|$)");
        el.className = el.className
          .replace(reg, " ")
          .replace(/^\s\s*/, "")
          .replace(/\s\s*$/, "");
      },
      addClass: function (el, className) {
        if (!framework.hasClass(el, className)) {
          el.className += (el.className ? " " : "") + className;
        }
      },
      hasClass: function (el, className) {
        return (
          el.className &&
          new RegExp("(^|\\s)" + className + "(\\s|$)").test(el.className)
        );
      },
      getChildByClass: function (parentEl, childClassName) {
        var node = parentEl.firstChild;
        while (node) {
          if (framework.hasClass(node, childClassName)) {
            return node;
          }
          node = node.nextSibling;
        }
      },
      arraySearch: function (array, value, key) {
        var i = array.length;
        while (i--) {
          if (array[i][key] === value) {
            return i;
          }
        }
        return -1;
      },
      extend: function (o1, o2, preventOverwrite) {
        for (var prop in o2) {
          if (o2.hasOwnProperty(prop)) {
            if (preventOverwrite && o1.hasOwnProperty(prop)) {
              continue;
            }
            o1[prop] = o2[prop];
          }
        }
      },
      easing: {
        sine: {
          out: function (k) {
            return Math.sin(k * (Math.PI / 2));
          },
          inOut: function (k) {
            return -(Math.cos(Math.PI * k) - 1) / 2;
          },
        },
        cubic: {
          out: function (k) {
            return --k * k * k + 1;
          },
        },
      },
      detectFeatures: function () {
        if (framework.features) {
          return framework.features;
        }
        var helperEl = framework.createEl(),
          helperStyle = helperEl.style,
          vendor = "",
          features = {};
        features.oldIE = document.all && !document.addEventListener;
        features.touch = "ontouchstart" in window;
        if (window.requestAnimationFrame) {
          features.raf = window.requestAnimationFrame;
          features.caf = window.cancelAnimationFrame;
        }
        features.pointerEvent =
          !!window.PointerEvent || navigator.msPointerEnabled;
        if (!features.pointerEvent) {
          var ua = navigator.userAgent;
          if (/iP(hone|od)/.test(navigator.platform)) {
            var v = navigator.appVersion.match(/OS (\d+)_(\d+)_?(\d+)?/);
            if (v && v.length > 0) {
              v = parseInt(v[1], 10);
              if (v >= 1 && v < 8) {
                features.isOldIOSPhone = true;
              }
            }
          }
          var match = ua.match(/Android\s([0-9\.]*)/);
          var androidversion = match ? match[1] : 0;
          androidversion = parseFloat(androidversion);
          if (androidversion >= 1) {
            if (androidversion < 4.4) {
              features.isOldAndroid = true;
            }
            features.androidVersion = androidversion;
          }
          features.isMobileOpera = /opera mini|opera mobi/i.test(ua);
        }
        var styleChecks = ["transform", "perspective", "animationName"],
          vendors = ["", "webkit", "Moz", "ms", "O"],
          styleCheckItem,
          styleName;
        for (var i = 0; i < 4; i++) {
          vendor = vendors[i];
          for (var a = 0; a < 3; a++) {
            styleCheckItem = styleChecks[a];
            styleName =
              vendor +
              (vendor
                ? styleCheckItem.charAt(0).toUpperCase() +
                  styleCheckItem.slice(1)
                : styleCheckItem);
            if (!features[styleCheckItem] && styleName in helperStyle) {
              features[styleCheckItem] = styleName;
            }
          }
          if (vendor && !features.raf) {
            vendor = vendor.toLowerCase();
            features.raf = window[vendor + "RequestAnimationFrame"];
            if (features.raf) {
              features.caf =
                window[vendor + "CancelAnimationFrame"] ||
                window[vendor + "CancelRequestAnimationFrame"];
            }
          }
        }
        if (!features.raf) {
          var lastTime = 0;
          features.raf = function (fn) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function () {
              fn(currTime + timeToCall);
            }, timeToCall);
            lastTime = currTime + timeToCall;
            return id;
          };
          features.caf = function (id) {
            clearTimeout(id);
          };
        }
        features.svg =
          !!document.createElementNS &&
          !!document.createElementNS("http://www.w3.org/2000/svg", "svg")
            .createSVGRect;
        framework.features = features;
        return features;
      },
    };
    framework.detectFeatures();
    if (framework.features.oldIE) {
      framework.bind = function (target, type, listener, unbind) {
        type = type.split(" ");
        var methodName = (unbind ? "detach" : "attach") + "Event",
          evName,
          _handleEv = function () {
            listener.handleEvent.call(listener);
          };
        for (var i = 0; i < type.length; i++) {
          evName = type[i];
          if (evName) {
            if (typeof listener === "object" && listener.handleEvent) {
              if (!unbind) {
                listener["oldIE" + evName] = _handleEv;
              } else {
                if (!listener["oldIE" + evName]) {
                  return false;
                }
              }
              target[methodName]("on" + evName, listener["oldIE" + evName]);
            } else {
              target[methodName]("on" + evName, listener);
            }
          }
        }
      };
    }
    var self = this;
    var DOUBLE_TAP_RADIUS = 25,
      NUM_HOLDERS = 3;
    var _options = {
      allowPanToNext: true,
      spacing: 0.12,
      bgOpacity: 1,
      mouseUsed: false,
      loop: true,
      pinchToClose: true,
      closeOnScroll: true,
      closeOnVerticalDrag: true,
      verticalDragRange: 0.75,
      hideAnimationDuration: 333,
      showAnimationDuration: 333,
      showHideOpacity: false,
      focus: true,
      escKey: true,
      arrowKeys: true,
      mainScrollEndFriction: 0.35,
      panEndFriction: 0.35,
      isClickableElement: function (el) {
        return el.tagName === "A";
      },
      getDoubleTapZoom: function (isMouseClick, item) {
        if (isMouseClick) {
          return 1;
        } else {
          return item.initialZoomLevel < 0.7 ? 1 : 1.33;
        }
      },
      maxSpreadZoom: 1.33,
      modal: true,
      scaleMode: "fit",
    };
    framework.extend(_options, options);
    var _getEmptyPoint = function () {
      return { x: 0, y: 0 };
    };
    var _isOpen,
      _isDestroying,
      _closedByScroll,
      _currentItemIndex,
      _containerStyle,
      _containerShiftIndex,
      _currPanDist = _getEmptyPoint(),
      _startPanOffset = _getEmptyPoint(),
      _panOffset = _getEmptyPoint(),
      _upMoveEvents,
      _downEvents,
      _globalEventHandlers,
      _viewportSize = {},
      _currZoomLevel,
      _startZoomLevel,
      _translatePrefix,
      _translateSufix,
      _updateSizeInterval,
      _itemsNeedUpdate,
      _currPositionIndex = 0,
      _offset = {},
      _slideSize = _getEmptyPoint(),
      _itemHolders,
      _prevItemIndex,
      _indexDiff = 0,
      _dragStartEvent,
      _dragMoveEvent,
      _dragEndEvent,
      _dragCancelEvent,
      _transformKey,
      _pointerEventEnabled,
      _isFixedPosition = true,
      _likelyTouchDevice,
      _modules = [],
      _requestAF,
      _cancelAF,
      _initalClassName,
      _initalWindowScrollY,
      _oldIE,
      _currentWindowScrollY,
      _features,
      _windowVisibleSize = {},
      _renderMaxResolution = false,
      _orientationChangeTimeout,
      _registerModule = function (name, module) {
        framework.extend(self, module.publicMethods);
        _modules.push(name);
      },
      _getLoopedId = function (index) {
        var numSlides = _getNumItems();
        if (index > numSlides - 1) {
          return index - numSlides;
        } else if (index < 0) {
          return numSlides + index;
        }
        return index;
      },
      _listeners = {},
      _listen = function (name, fn) {
        if (!_listeners[name]) {
          _listeners[name] = [];
        }
        return _listeners[name].push(fn);
      },
      _shout = function (name) {
        var listeners = _listeners[name];
        if (listeners) {
          var args = Array.prototype.slice.call(arguments);
          args.shift();
          for (var i = 0; i < listeners.length; i++) {
            listeners[i].apply(self, args);
          }
        }
      },
      _getCurrentTime = function () {
        return new Date().getTime();
      },
      _applyBgOpacity = function (opacity) {
        _bgOpacity = opacity;
        self.bg.style.opacity = opacity * _options.bgOpacity;
      },
      _applyZoomTransform = function (styleObj, x, y, zoom, item) {
        if (!_renderMaxResolution || (item && item !== self.currItem)) {
          zoom = zoom / (item ? item.fitRatio : self.currItem.fitRatio);
        }
        styleObj[_transformKey] =
          _translatePrefix +
          x +
          "px, " +
          y +
          "px" +
          _translateSufix +
          " scale(" +
          zoom +
          ")";
      },
      _applyCurrentZoomPan = function (allowRenderResolution) {
        if (_currZoomElementStyle) {
          if (allowRenderResolution) {
            if (_currZoomLevel > self.currItem.fitRatio) {
              if (!_renderMaxResolution) {
                _setImageSize(self.currItem, false, true);
                _renderMaxResolution = true;
              }
            } else {
              if (_renderMaxResolution) {
                _setImageSize(self.currItem);
                _renderMaxResolution = false;
              }
            }
          }
          _applyZoomTransform(
            _currZoomElementStyle,
            _panOffset.x,
            _panOffset.y,
            _currZoomLevel,
          );
        }
      },
      _applyZoomPanToItem = function (item) {
        if (item.container) {
          _applyZoomTransform(
            item.container.style,
            item.initialPosition.x,
            item.initialPosition.y,
            item.initialZoomLevel,
            item,
          );
        }
      },
      _setTranslateX = function (x, elStyle) {
        elStyle[_transformKey] =
          _translatePrefix + x + "px, 0px" + _translateSufix;
      },
      _moveMainScroll = function (x, dragging) {
        if (!_options.loop && dragging) {
          var newSlideIndexOffset =
              _currentItemIndex +
              (_slideSize.x * _currPositionIndex - x) / _slideSize.x,
            delta = Math.round(x - _mainScrollPos.x);
          if (
            (newSlideIndexOffset < 0 && delta > 0) ||
            (newSlideIndexOffset >= _getNumItems() - 1 && delta < 0)
          ) {
            x = _mainScrollPos.x + delta * _options.mainScrollEndFriction;
          }
        }
        _mainScrollPos.x = x;
        _setTranslateX(x, _containerStyle);
      },
      _calculatePanOffset = function (axis, zoomLevel) {
        var m = _midZoomPoint[axis] - _offset[axis];
        return (
          _startPanOffset[axis] +
          _currPanDist[axis] +
          m -
          m * (zoomLevel / _startZoomLevel)
        );
      },
      _equalizePoints = function (p1, p2) {
        p1.x = p2.x;
        p1.y = p2.y;
        if (p2.id) {
          p1.id = p2.id;
        }
      },
      _roundPoint = function (p) {
        p.x = Math.round(p.x);
        p.y = Math.round(p.y);
      },
      _mouseMoveTimeout = null,
      _onFirstMouseMove = function () {
        if (_mouseMoveTimeout) {
          framework.unbind(document, "mousemove", _onFirstMouseMove);
          framework.addClass(template, "pswp--has_mouse");
          _options.mouseUsed = true;
          _shout("mouseUsed");
        }
        _mouseMoveTimeout = setTimeout(function () {
          _mouseMoveTimeout = null;
        }, 100);
      },
      _bindEvents = function () {
        framework.bind(document, "keydown", self);
        if (_features.transform) {
          framework.bind(self.scrollWrap, "click", self);
        }
        if (!_options.mouseUsed) {
          framework.bind(document, "mousemove", _onFirstMouseMove);
        }
        framework.bind(window, "resize scroll orientationchange", self);
        _shout("bindEvents");
      },
      _unbindEvents = function () {
        framework.unbind(window, "resize scroll orientationchange", self);
        framework.unbind(window, "scroll", _globalEventHandlers.scroll);
        framework.unbind(document, "keydown", self);
        framework.unbind(document, "mousemove", _onFirstMouseMove);
        if (_features.transform) {
          framework.unbind(self.scrollWrap, "click", self);
        }
        if (_isDragging) {
          framework.unbind(window, _upMoveEvents, self);
        }
        clearTimeout(_orientationChangeTimeout);
        _shout("unbindEvents");
      },
      _calculatePanBounds = function (zoomLevel, update) {
        var bounds = _calculateItemSize(
          self.currItem,
          _viewportSize,
          zoomLevel,
        );
        if (update) {
          _currPanBounds = bounds;
        }
        return bounds;
      },
      _getMinZoomLevel = function (item) {
        if (!item) {
          item = self.currItem;
        }
        return item.initialZoomLevel;
      },
      _getMaxZoomLevel = function (item) {
        if (!item) {
          item = self.currItem;
        }
        return item.w > 0 ? _options.maxSpreadZoom : 1;
      },
      _modifyDestPanOffset = function (
        axis,
        destPanBounds,
        destPanOffset,
        destZoomLevel,
      ) {
        if (destZoomLevel === self.currItem.initialZoomLevel) {
          destPanOffset[axis] = self.currItem.initialPosition[axis];
          return true;
        } else {
          destPanOffset[axis] = _calculatePanOffset(axis, destZoomLevel);
          if (destPanOffset[axis] > destPanBounds.min[axis]) {
            destPanOffset[axis] = destPanBounds.min[axis];
            return true;
          } else if (destPanOffset[axis] < destPanBounds.max[axis]) {
            destPanOffset[axis] = destPanBounds.max[axis];
            return true;
          }
        }
        return false;
      },
      _setupTransforms = function () {
        if (_transformKey) {
          var allow3dTransform = _features.perspective && !_likelyTouchDevice;
          _translatePrefix = "translate" + (allow3dTransform ? "3d(" : "(");
          _translateSufix = _features.perspective ? ", 0px)" : ")";
          return;
        }
        _transformKey = "left";
        framework.addClass(template, "pswp--ie");
        _setTranslateX = function (x, elStyle) {
          elStyle.left = x + "px";
        };
        _applyZoomPanToItem = function (item) {
          var zoomRatio = item.fitRatio > 1 ? 1 : item.fitRatio,
            s = item.container.style,
            w = zoomRatio * item.w,
            h = zoomRatio * item.h;
          s.width = w + "px";
          s.height = h + "px";
          s.left = item.initialPosition.x + "px";
          s.top = item.initialPosition.y + "px";
        };
        _applyCurrentZoomPan = function () {
          if (_currZoomElementStyle) {
            var s = _currZoomElementStyle,
              item = self.currItem,
              zoomRatio = item.fitRatio > 1 ? 1 : item.fitRatio,
              w = zoomRatio * item.w,
              h = zoomRatio * item.h;
            s.width = w + "px";
            s.height = h + "px";
            s.left = _panOffset.x + "px";
            s.top = _panOffset.y + "px";
          }
        };
      },
      _onKeyDown = function (e) {
        var keydownAction = "";
        if (_options.escKey && e.keyCode === 27) {
          keydownAction = "close";
        } else if (_options.arrowKeys) {
          if (e.keyCode === 37) {
            keydownAction = "prev";
          } else if (e.keyCode === 39) {
            keydownAction = "next";
          }
        }
        if (keydownAction) {
          if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
            if (e.preventDefault) {
              e.preventDefault();
            } else {
              e.returnValue = false;
            }
            self[keydownAction]();
          }
        }
      },
      _onGlobalClick = function (e) {
        if (!e) {
          return;
        }
        if (
          _moved ||
          _zoomStarted ||
          _mainScrollAnimating ||
          _verticalDragInitiated
        ) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      _updatePageScrollOffset = function () {
        self.setScrollOffset(0, framework.getScrollY());
      };
    var _animations = {},
      _numAnimations = 0,
      _stopAnimation = function (name) {
        if (_animations[name]) {
          if (_animations[name].raf) {
            _cancelAF(_animations[name].raf);
          }
          _numAnimations--;
          delete _animations[name];
        }
      },
      _registerStartAnimation = function (name) {
        if (_animations[name]) {
          _stopAnimation(name);
        }
        if (!_animations[name]) {
          _numAnimations++;
          _animations[name] = {};
        }
      },
      _stopAllAnimations = function () {
        for (var prop in _animations) {
          if (_animations.hasOwnProperty(prop)) {
            _stopAnimation(prop);
          }
        }
      },
      _animateProp = function (
        name,
        b,
        endProp,
        d,
        easingFn,
        onUpdate,
        onComplete,
      ) {
        var startAnimTime = _getCurrentTime(),
          t;
        _registerStartAnimation(name);
        var animloop = function () {
          if (_animations[name]) {
            t = _getCurrentTime() - startAnimTime;
            if (t >= d) {
              _stopAnimation(name);
              onUpdate(endProp);
              if (onComplete) {
                onComplete();
              }
              return;
            }
            onUpdate((endProp - b) * easingFn(t / d) + b);
            _animations[name].raf = _requestAF(animloop);
          }
        };
        animloop();
      };
    var publicMethods = {
      shout: _shout,
      listen: _listen,
      viewportSize: _viewportSize,
      options: _options,
      isMainScrollAnimating: function () {
        return _mainScrollAnimating;
      },
      getZoomLevel: function () {
        return _currZoomLevel;
      },
      getCurrentIndex: function () {
        return _currentItemIndex;
      },
      isDragging: function () {
        return _isDragging;
      },
      isZooming: function () {
        return _isZooming;
      },
      setScrollOffset: function (x, y) {
        _offset.x = x;
        _currentWindowScrollY = _offset.y = y;
        _shout("updateScrollOffset", _offset);
      },
      applyZoomPan: function (zoomLevel, panX, panY, allowRenderResolution) {
        _panOffset.x = panX;
        _panOffset.y = panY;
        _currZoomLevel = zoomLevel;
        _applyCurrentZoomPan(allowRenderResolution);
      },
      init: function () {
        if (_isOpen || _isDestroying) {
          return;
        }
        var i;
        self.framework = framework;
        self.template = template;
        self.bg = framework.getChildByClass(template, "pswp__bg");
        _initalClassName = template.className;
        _isOpen = true;
        _features = framework.detectFeatures();
        _requestAF = _features.raf;
        _cancelAF = _features.caf;
        _transformKey = _features.transform;
        _oldIE = _features.oldIE;
        self.scrollWrap = framework.getChildByClass(
          template,
          "pswp__scroll-wrap",
        );
        self.container = framework.getChildByClass(
          self.scrollWrap,
          "pswp__container",
        );
        _containerStyle = self.container.style;
        self.itemHolders = _itemHolders = [
          { el: self.container.children[0], wrap: 0, index: -1 },
          { el: self.container.children[1], wrap: 0, index: -1 },
          { el: self.container.children[2], wrap: 0, index: -1 },
        ];
        _itemHolders[0].el.style.display = _itemHolders[2].el.style.display =
          "none";
        _setupTransforms();
        _globalEventHandlers = {
          resize: self.updateSize,
          orientationchange: function () {
            clearTimeout(_orientationChangeTimeout);
            _orientationChangeTimeout = setTimeout(function () {
              if (_viewportSize.x !== self.scrollWrap.clientWidth) {
                self.updateSize();
              }
            }, 500);
          },
          scroll: _updatePageScrollOffset,
          keydown: _onKeyDown,
          click: _onGlobalClick,
        };
        var oldPhone =
          _features.isOldIOSPhone ||
          _features.isOldAndroid ||
          _features.isMobileOpera;
        if (!_features.animationName || !_features.transform || oldPhone) {
          _options.showAnimationDuration = _options.hideAnimationDuration = 0;
        }
        for (i = 0; i < _modules.length; i++) {
          self["init" + _modules[i]]();
        }
        if (UiClass) {
          var ui = (self.ui = new UiClass(self, framework));
          ui.init();
        }
        _shout("firstUpdate");
        _currentItemIndex = _currentItemIndex || _options.index || 0;
        if (
          isNaN(_currentItemIndex) ||
          _currentItemIndex < 0 ||
          _currentItemIndex >= _getNumItems()
        ) {
          _currentItemIndex = 0;
        }
        self.currItem = _getItemAt(_currentItemIndex);
        if (_features.isOldIOSPhone || _features.isOldAndroid) {
          _isFixedPosition = false;
        }
        template.setAttribute("aria-hidden", "false");
        if (_options.modal) {
          if (!_isFixedPosition) {
            template.style.position = "absolute";
            template.style.top = framework.getScrollY() + "px";
          } else {
            template.style.position = "fixed";
          }
        }
        if (_currentWindowScrollY === undefined) {
          _shout("initialLayout");
          _currentWindowScrollY = _initalWindowScrollY = framework.getScrollY();
        }
        var rootClasses = "pswp--open ";
        if (_options.mainClass) {
          rootClasses += _options.mainClass + " ";
        }
        if (_options.showHideOpacity) {
          rootClasses += "pswp--animate_opacity ";
        }
        rootClasses += _likelyTouchDevice ? "pswp--touch" : "pswp--notouch";
        rootClasses += _features.animationName ? " pswp--css_animation" : "";
        rootClasses += _features.svg ? " pswp--svg" : "";
        framework.addClass(template, rootClasses);
        self.updateSize();
        _containerShiftIndex = -1;
        _indexDiff = null;
        for (i = 0; i < NUM_HOLDERS; i++) {
          _setTranslateX(
            (i + _containerShiftIndex) * _slideSize.x,
            _itemHolders[i].el.style,
          );
        }
        if (!_oldIE) {
          framework.bind(self.scrollWrap, _downEvents, self);
        }
        _listen("initialZoomInEnd", function () {
          self.setContent(_itemHolders[0], _currentItemIndex - 1);
          self.setContent(_itemHolders[2], _currentItemIndex + 1);
          _itemHolders[0].el.style.display = _itemHolders[2].el.style.display =
            "block";
          if (_options.focus) {
            template.focus();
          }
          _bindEvents();
        });
        self.setContent(_itemHolders[1], _currentItemIndex);
        self.updateCurrItem();
        _shout("afterInit");
        if (!_isFixedPosition) {
          _updateSizeInterval = setInterval(function () {
            if (
              !_numAnimations &&
              !_isDragging &&
              !_isZooming &&
              _currZoomLevel === self.currItem.initialZoomLevel
            ) {
              self.updateSize();
            }
          }, 1000);
        }
        framework.addClass(template, "pswp--visible");
      },
      close: function () {
        if (!_isOpen) {
          return;
        }
        _isOpen = false;
        _isDestroying = true;
        _shout("close");
        _unbindEvents();
        _showOrHide(self.currItem, null, true, self.destroy);
      },
      destroy: function () {
        _shout("destroy");
        if (_showOrHideTimeout) {
          clearTimeout(_showOrHideTimeout);
        }
        template.setAttribute("aria-hidden", "true");
        template.className = _initalClassName;
        if (_updateSizeInterval) {
          clearInterval(_updateSizeInterval);
        }
        framework.unbind(self.scrollWrap, _downEvents, self);
        framework.unbind(window, "scroll", self);
        _stopDragUpdateLoop();
        _stopAllAnimations();
        _listeners = null;
      },
      panTo: function (x, y, force) {
        if (!force) {
          if (x > _currPanBounds.min.x) {
            x = _currPanBounds.min.x;
          } else if (x < _currPanBounds.max.x) {
            x = _currPanBounds.max.x;
          }
          if (y > _currPanBounds.min.y) {
            y = _currPanBounds.min.y;
          } else if (y < _currPanBounds.max.y) {
            y = _currPanBounds.max.y;
          }
        }
        _panOffset.x = x;
        _panOffset.y = y;
        _applyCurrentZoomPan();
      },
      handleEvent: function (e) {
        e = e || window.event;
        if (_globalEventHandlers[e.type]) {
          _globalEventHandlers[e.type](e);
        }
      },
      goTo: function (index) {
        index = _getLoopedId(index);
        var diff = index - _currentItemIndex;
        _indexDiff = diff;
        _currentItemIndex = index;
        self.currItem = _getItemAt(_currentItemIndex);
        _currPositionIndex -= diff;
        _moveMainScroll(_slideSize.x * _currPositionIndex);
        _stopAllAnimations();
        _mainScrollAnimating = false;
        self.updateCurrItem();
      },
      next: function () {
        self.goTo(_currentItemIndex + 1);
      },
      prev: function () {
        self.goTo(_currentItemIndex - 1);
      },
      updateCurrZoomItem: function (emulateSetContent) {
        if (emulateSetContent) {
          _shout("beforeChange", 0);
        }
        if (_itemHolders[1].el.children.length) {
          var zoomElement = _itemHolders[1].el.children[0];
          if (framework.hasClass(zoomElement, "pswp__zoom-wrap")) {
            _currZoomElementStyle = zoomElement.style;
          } else {
            _currZoomElementStyle = null;
          }
        } else {
          _currZoomElementStyle = null;
        }
        _currPanBounds = self.currItem.bounds;
        _startZoomLevel = _currZoomLevel = self.currItem.initialZoomLevel;
        _panOffset.x = _currPanBounds.center.x;
        _panOffset.y = _currPanBounds.center.y;
        if (emulateSetContent) {
          _shout("afterChange");
        }
      },
      invalidateCurrItems: function () {
        _itemsNeedUpdate = true;
        for (var i = 0; i < NUM_HOLDERS; i++) {
          if (_itemHolders[i].item) {
            _itemHolders[i].item.needsUpdate = true;
          }
        }
      },
      updateCurrItem: function (beforeAnimation) {
        if (_indexDiff === 0) {
          return;
        }
        var diffAbs = Math.abs(_indexDiff),
          tempHolder;
        if (beforeAnimation && diffAbs < 2) {
          return;
        }
        self.currItem = _getItemAt(_currentItemIndex);
        _renderMaxResolution = false;
        _shout("beforeChange", _indexDiff);
        if (diffAbs >= NUM_HOLDERS) {
          _containerShiftIndex +=
            _indexDiff + (_indexDiff > 0 ? -NUM_HOLDERS : NUM_HOLDERS);
          diffAbs = NUM_HOLDERS;
        }
        for (var i = 0; i < diffAbs; i++) {
          if (_indexDiff > 0) {
            tempHolder = _itemHolders.shift();
            _itemHolders[NUM_HOLDERS - 1] = tempHolder;
            _containerShiftIndex++;
            _setTranslateX(
              (_containerShiftIndex + 2) * _slideSize.x,
              tempHolder.el.style,
            );
            self.setContent(
              tempHolder,
              _currentItemIndex - diffAbs + i + 1 + 1,
            );
          } else {
            tempHolder = _itemHolders.pop();
            _itemHolders.unshift(tempHolder);
            _containerShiftIndex--;
            _setTranslateX(
              _containerShiftIndex * _slideSize.x,
              tempHolder.el.style,
            );
            self.setContent(
              tempHolder,
              _currentItemIndex + diffAbs - i - 1 - 1,
            );
          }
        }
        if (_currZoomElementStyle && Math.abs(_indexDiff) === 1) {
          var prevItem = _getItemAt(_prevItemIndex);
          if (prevItem.initialZoomLevel !== _currZoomLevel) {
            _calculateItemSize(prevItem, _viewportSize);
            _setImageSize(prevItem);
            _applyZoomPanToItem(prevItem);
          }
        }
        _indexDiff = 0;
        self.updateCurrZoomItem();
        _prevItemIndex = _currentItemIndex;
        _shout("afterChange");
      },
      updateSize: function (force) {
        if (!_isFixedPosition && _options.modal) {
          var windowScrollY = framework.getScrollY();
          if (_currentWindowScrollY !== windowScrollY) {
            template.style.top = windowScrollY + "px";
            _currentWindowScrollY = windowScrollY;
          }
          if (
            !force &&
            _windowVisibleSize.x === window.innerWidth &&
            _windowVisibleSize.y === window.innerHeight
          ) {
            return;
          }
          _windowVisibleSize.x = window.innerWidth;
          _windowVisibleSize.y = window.innerHeight;
          template.style.height = _windowVisibleSize.y + "px";
        }
        _viewportSize.x = self.scrollWrap.clientWidth;
        _viewportSize.y = self.scrollWrap.clientHeight;
        _updatePageScrollOffset();
        _slideSize.x =
          _viewportSize.x + Math.round(_viewportSize.x * _options.spacing);
        _slideSize.y = _viewportSize.y;
        _moveMainScroll(_slideSize.x * _currPositionIndex);
        _shout("beforeResize");
        if (_containerShiftIndex !== undefined) {
          var holder, item, hIndex;
          for (var i = 0; i < NUM_HOLDERS; i++) {
            holder = _itemHolders[i];
            _setTranslateX(
              (i + _containerShiftIndex) * _slideSize.x,
              holder.el.style,
            );
            hIndex = _currentItemIndex + i - 1;
            if (_options.loop && _getNumItems() > 2) {
              hIndex = _getLoopedId(hIndex);
            }
            item = _getItemAt(hIndex);
            if (
              item &&
              (_itemsNeedUpdate || item.needsUpdate || !item.bounds)
            ) {
              self.cleanSlide(item);
              self.setContent(holder, hIndex);
              if (i === 1) {
                self.currItem = item;
                self.updateCurrZoomItem(true);
              }
              item.needsUpdate = false;
            } else if (holder.index === -1 && hIndex >= 0) {
              self.setContent(holder, hIndex);
            }
            if (item && item.container) {
              _calculateItemSize(item, _viewportSize);
              _setImageSize(item);
              _applyZoomPanToItem(item);
            }
          }
          _itemsNeedUpdate = false;
        }
        _startZoomLevel = _currZoomLevel = self.currItem.initialZoomLevel;
        _currPanBounds = self.currItem.bounds;
        if (_currPanBounds) {
          _panOffset.x = _currPanBounds.center.x;
          _panOffset.y = _currPanBounds.center.y;
          _applyCurrentZoomPan(true);
        }
        _shout("resize");
      },
      zoomTo: function (destZoomLevel, centerPoint, speed, easingFn, updateFn) {
        if (centerPoint) {
          _startZoomLevel = _currZoomLevel;
          _midZoomPoint.x = Math.abs(centerPoint.x) - _panOffset.x;
          _midZoomPoint.y = Math.abs(centerPoint.y) - _panOffset.y;
          _equalizePoints(_startPanOffset, _panOffset);
        }
        var destPanBounds = _calculatePanBounds(destZoomLevel, false),
          destPanOffset = {};
        _modifyDestPanOffset("x", destPanBounds, destPanOffset, destZoomLevel);
        _modifyDestPanOffset("y", destPanBounds, destPanOffset, destZoomLevel);
        var initialZoomLevel = _currZoomLevel;
        var initialPanOffset = { x: _panOffset.x, y: _panOffset.y };
        _roundPoint(destPanOffset);
        var onUpdate = function (now) {
          if (now === 1) {
            _currZoomLevel = destZoomLevel;
            _panOffset.x = destPanOffset.x;
            _panOffset.y = destPanOffset.y;
          } else {
            _currZoomLevel =
              (destZoomLevel - initialZoomLevel) * now + initialZoomLevel;
            _panOffset.x =
              (destPanOffset.x - initialPanOffset.x) * now + initialPanOffset.x;
            _panOffset.y =
              (destPanOffset.y - initialPanOffset.y) * now + initialPanOffset.y;
          }
          if (updateFn) {
            updateFn(now);
          }
          _applyCurrentZoomPan(now === 1);
        };
        if (speed) {
          _animateProp(
            "customZoomTo",
            0,
            1,
            speed,
            easingFn || framework.easing.sine.inOut,
            onUpdate,
          );
        } else {
          onUpdate(1);
        }
      },
    };
    var MIN_SWIPE_DISTANCE = 30,
      DIRECTION_CHECK_OFFSET = 10;
    var _gestureStartTime,
      _gestureCheckSpeedTime,
      p = {},
      p2 = {},
      delta = {},
      _currPoint = {},
      _startPoint = {},
      _currPointers = [],
      _startMainScrollPos = {},
      _releaseAnimData,
      _posPoints = [],
      _tempPoint = {},
      _isZoomingIn,
      _verticalDragInitiated,
      _oldAndroidTouchEndTimeout,
      _currZoomedItemIndex = 0,
      _centerPoint = _getEmptyPoint(),
      _lastReleaseTime = 0,
      _isDragging,
      _isMultitouch,
      _zoomStarted,
      _moved,
      _dragAnimFrame,
      _mainScrollShifted,
      _currentPoints,
      _isZooming,
      _currPointsDistance,
      _startPointsDistance,
      _currPanBounds,
      _mainScrollPos = _getEmptyPoint(),
      _currZoomElementStyle,
      _mainScrollAnimating,
      _midZoomPoint = _getEmptyPoint(),
      _currCenterPoint = _getEmptyPoint(),
      _direction,
      _isFirstMove,
      _opacityChanged,
      _bgOpacity,
      _wasOverInitialZoom,
      _isEqualPoints = function (p1, p2) {
        return p1.x === p2.x && p1.y === p2.y;
      },
      _isNearbyPoints = function (touch0, touch1) {
        return (
          Math.abs(touch0.x - touch1.x) < DOUBLE_TAP_RADIUS &&
          Math.abs(touch0.y - touch1.y) < DOUBLE_TAP_RADIUS
        );
      },
      _calculatePointsDistance = function (p1, p2) {
        _tempPoint.x = Math.abs(p1.x - p2.x);
        _tempPoint.y = Math.abs(p1.y - p2.y);
        return Math.sqrt(
          _tempPoint.x * _tempPoint.x + _tempPoint.y * _tempPoint.y,
        );
      },
      _stopDragUpdateLoop = function () {
        if (_dragAnimFrame) {
          _cancelAF(_dragAnimFrame);
          _dragAnimFrame = null;
        }
      },
      _dragUpdateLoop = function () {
        if (_isDragging) {
          _dragAnimFrame = _requestAF(_dragUpdateLoop);
          _renderMovement();
        }
      },
      _canPan = function () {
        return !(
          _options.scaleMode === "fit" &&
          _currZoomLevel === self.currItem.initialZoomLevel
        );
      },
      _closestElement = function (el, fn) {
        if (!el || el === document) {
          return false;
        }
        if (
          el.getAttribute("class") &&
          el.getAttribute("class").indexOf("pswp__scroll-wrap") > -1
        ) {
          return false;
        }
        if (fn(el)) {
          return el;
        }
        return _closestElement(el.parentNode, fn);
      },
      _preventObj = {},
      _preventDefaultEventBehaviour = function (e, isDown) {
        _preventObj.prevent = !_closestElement(
          e.target,
          _options.isClickableElement,
        );
        _shout("preventDragEvent", e, isDown, _preventObj);
        return _preventObj.prevent;
      },
      _convertTouchToPoint = function (touch, p) {
        p.x = touch.pageX;
        p.y = touch.pageY;
        p.id = touch.identifier;
        return p;
      },
      _findCenterOfPoints = function (p1, p2, pCenter) {
        pCenter.x = (p1.x + p2.x) * 0.5;
        pCenter.y = (p1.y + p2.y) * 0.5;
      },
      _pushPosPoint = function (time, x, y) {
        if (time - _gestureCheckSpeedTime > 50) {
          var o = _posPoints.length > 2 ? _posPoints.shift() : {};
          o.x = x;
          o.y = y;
          _posPoints.push(o);
          _gestureCheckSpeedTime = time;
        }
      },
      _calculateVerticalDragOpacityRatio = function () {
        var yOffset = _panOffset.y - self.currItem.initialPosition.y;
        return 1 - Math.abs(yOffset / (_viewportSize.y / 2));
      },
      _ePoint1 = {},
      _ePoint2 = {},
      _tempPointsArr = [],
      _tempCounter,
      _getTouchPoints = function (e) {
        while (_tempPointsArr.length > 0) {
          _tempPointsArr.pop();
        }
        if (!_pointerEventEnabled) {
          if (e.type.indexOf("touch") > -1) {
            if (e.touches && e.touches.length > 0) {
              _tempPointsArr[0] = _convertTouchToPoint(e.touches[0], _ePoint1);
              if (e.touches.length > 1) {
                _tempPointsArr[1] = _convertTouchToPoint(
                  e.touches[1],
                  _ePoint2,
                );
              }
            }
          } else {
            _ePoint1.x = e.pageX;
            _ePoint1.y = e.pageY;
            _ePoint1.id = "";
            _tempPointsArr[0] = _ePoint1;
          }
        } else {
          _tempCounter = 0;
          _currPointers.forEach(function (p) {
            if (_tempCounter === 0) {
              _tempPointsArr[0] = p;
            } else if (_tempCounter === 1) {
              _tempPointsArr[1] = p;
            }
            _tempCounter++;
          });
        }
        return _tempPointsArr;
      },
      _panOrMoveMainScroll = function (axis, delta) {
        var panFriction,
          overDiff = 0,
          newOffset = _panOffset[axis] + delta[axis],
          startOverDiff,
          dir = delta[axis] > 0,
          newMainScrollPosition = _mainScrollPos.x + delta.x,
          mainScrollDiff = _mainScrollPos.x - _startMainScrollPos.x,
          newPanPos,
          newMainScrollPos;
        if (
          newOffset > _currPanBounds.min[axis] ||
          newOffset < _currPanBounds.max[axis]
        ) {
          panFriction = _options.panEndFriction;
        } else {
          panFriction = 1;
        }
        newOffset = _panOffset[axis] + delta[axis] * panFriction;
        if (
          _options.allowPanToNext ||
          _currZoomLevel === self.currItem.initialZoomLevel
        ) {
          if (!_currZoomElementStyle) {
            newMainScrollPos = newMainScrollPosition;
          } else if (_direction === "h" && axis === "x" && !_zoomStarted) {
            if (dir) {
              if (newOffset > _currPanBounds.min[axis]) {
                panFriction = _options.panEndFriction;
                overDiff = _currPanBounds.min[axis] - newOffset;
                startOverDiff =
                  _currPanBounds.min[axis] - _startPanOffset[axis];
              }
              if (
                (startOverDiff <= 0 || mainScrollDiff < 0) &&
                _getNumItems() > 1
              ) {
                newMainScrollPos = newMainScrollPosition;
                if (
                  mainScrollDiff < 0 &&
                  newMainScrollPosition > _startMainScrollPos.x
                ) {
                  newMainScrollPos = _startMainScrollPos.x;
                }
              } else {
                if (_currPanBounds.min.x !== _currPanBounds.max.x) {
                  newPanPos = newOffset;
                }
              }
            } else {
              if (newOffset < _currPanBounds.max[axis]) {
                panFriction = _options.panEndFriction;
                overDiff = newOffset - _currPanBounds.max[axis];
                startOverDiff =
                  _startPanOffset[axis] - _currPanBounds.max[axis];
              }
              if (
                (startOverDiff <= 0 || mainScrollDiff > 0) &&
                _getNumItems() > 1
              ) {
                newMainScrollPos = newMainScrollPosition;
                if (
                  mainScrollDiff > 0 &&
                  newMainScrollPosition < _startMainScrollPos.x
                ) {
                  newMainScrollPos = _startMainScrollPos.x;
                }
              } else {
                if (_currPanBounds.min.x !== _currPanBounds.max.x) {
                  newPanPos = newOffset;
                }
              }
            }
          }
          if (axis === "x") {
            if (newMainScrollPos !== undefined) {
              _moveMainScroll(newMainScrollPos, true);
              if (newMainScrollPos === _startMainScrollPos.x) {
                _mainScrollShifted = false;
              } else {
                _mainScrollShifted = true;
              }
            }
            if (_currPanBounds.min.x !== _currPanBounds.max.x) {
              if (newPanPos !== undefined) {
                _panOffset.x = newPanPos;
              } else if (!_mainScrollShifted) {
                _panOffset.x += delta.x * panFriction;
              }
            }
            return newMainScrollPos !== undefined;
          }
        }
        if (!_mainScrollAnimating) {
          if (!_mainScrollShifted) {
            if (_currZoomLevel > self.currItem.fitRatio) {
              _panOffset[axis] += delta[axis] * panFriction;
            }
          }
        }
      },
      _onDragStart = function (e) {
        if (e.type === "mousedown" && e.button > 0) {
          return;
        }
        if (_initialZoomRunning) {
          e.preventDefault();
          return;
        }
        if (_oldAndroidTouchEndTimeout && e.type === "mousedown") {
          return;
        }
        if (_preventDefaultEventBehaviour(e, true)) {
          e.preventDefault();
        }
        _shout("pointerDown");
        if (_pointerEventEnabled) {
          var pointerIndex = framework.arraySearch(
            _currPointers,
            e.pointerId,
            "id",
          );
          if (pointerIndex < 0) {
            pointerIndex = _currPointers.length;
          }
          _currPointers[pointerIndex] = {
            x: e.pageX,
            y: e.pageY,
            id: e.pointerId,
          };
        }
        var startPointsList = _getTouchPoints(e),
          numPoints = startPointsList.length;
        _currentPoints = null;
        _stopAllAnimations();
        if (!_isDragging || numPoints === 1) {
          _isDragging = _isFirstMove = true;
          framework.bind(window, _upMoveEvents, self);
          _isZoomingIn =
            _wasOverInitialZoom =
            _opacityChanged =
            _verticalDragInitiated =
            _mainScrollShifted =
            _moved =
            _isMultitouch =
            _zoomStarted =
              false;
          _direction = null;
          _shout("firstTouchStart", startPointsList);
          _equalizePoints(_startPanOffset, _panOffset);
          _currPanDist.x = _currPanDist.y = 0;
          _equalizePoints(_currPoint, startPointsList[0]);
          _equalizePoints(_startPoint, _currPoint);
          _startMainScrollPos.x = _slideSize.x * _currPositionIndex;
          _posPoints = [{ x: _currPoint.x, y: _currPoint.y }];
          _gestureCheckSpeedTime = _gestureStartTime = _getCurrentTime();
          _calculatePanBounds(_currZoomLevel, true);
          _stopDragUpdateLoop();
          _dragUpdateLoop();
        }
        if (
          !_isZooming &&
          numPoints > 1 &&
          !_mainScrollAnimating &&
          !_mainScrollShifted
        ) {
          _startZoomLevel = _currZoomLevel;
          _zoomStarted = false;
          _isZooming = _isMultitouch = true;
          _currPanDist.y = _currPanDist.x = 0;
          _equalizePoints(_startPanOffset, _panOffset);
          _equalizePoints(p, startPointsList[0]);
          _equalizePoints(p2, startPointsList[1]);
          _findCenterOfPoints(p, p2, _currCenterPoint);
          _midZoomPoint.x = Math.abs(_currCenterPoint.x) - _panOffset.x;
          _midZoomPoint.y = Math.abs(_currCenterPoint.y) - _panOffset.y;
          _currPointsDistance = _startPointsDistance = _calculatePointsDistance(
            p,
            p2,
          );
        }
      },
      _onDragMove = function (e) {
        e.preventDefault();
        if (_pointerEventEnabled) {
          var pointerIndex = framework.arraySearch(
            _currPointers,
            e.pointerId,
            "id",
          );
          if (pointerIndex > -1) {
            var p = _currPointers[pointerIndex];
            p.x = e.pageX;
            p.y = e.pageY;
          }
        }
        if (_isDragging) {
          var touchesList = _getTouchPoints(e);
          if (!_direction && !_moved && !_isZooming) {
            if (_mainScrollPos.x !== _slideSize.x * _currPositionIndex) {
              _direction = "h";
            } else {
              var diff =
                Math.abs(touchesList[0].x - _currPoint.x) -
                Math.abs(touchesList[0].y - _currPoint.y);
              if (Math.abs(diff) >= DIRECTION_CHECK_OFFSET) {
                _direction = diff > 0 ? "h" : "v";
                _currentPoints = touchesList;
              }
            }
          } else {
            _currentPoints = touchesList;
          }
        }
      },
      _renderMovement = function () {
        if (!_currentPoints) {
          return;
        }
        var numPoints = _currentPoints.length;
        if (numPoints === 0) {
          return;
        }
        _equalizePoints(p, _currentPoints[0]);
        delta.x = p.x - _currPoint.x;
        delta.y = p.y - _currPoint.y;
        if (_isZooming && numPoints > 1) {
          _currPoint.x = p.x;
          _currPoint.y = p.y;
          if (!delta.x && !delta.y && _isEqualPoints(_currentPoints[1], p2)) {
            return;
          }
          _equalizePoints(p2, _currentPoints[1]);
          if (!_zoomStarted) {
            _zoomStarted = true;
            _shout("zoomGestureStarted");
          }
          var pointsDistance = _calculatePointsDistance(p, p2);
          var zoomLevel = _calculateZoomLevel(pointsDistance);
          if (
            zoomLevel >
            self.currItem.initialZoomLevel + self.currItem.initialZoomLevel / 15
          ) {
            _wasOverInitialZoom = true;
          }
          var zoomFriction = 1,
            minZoomLevel = _getMinZoomLevel(),
            maxZoomLevel = _getMaxZoomLevel();
          if (zoomLevel < minZoomLevel) {
            if (
              _options.pinchToClose &&
              !_wasOverInitialZoom &&
              _startZoomLevel <= self.currItem.initialZoomLevel
            ) {
              var minusDiff = minZoomLevel - zoomLevel;
              var percent = 1 - minusDiff / (minZoomLevel / 1.2);
              _applyBgOpacity(percent);
              _shout("onPinchClose", percent);
              _opacityChanged = true;
            } else {
              zoomFriction = (minZoomLevel - zoomLevel) / minZoomLevel;
              if (zoomFriction > 1) {
                zoomFriction = 1;
              }
              zoomLevel = minZoomLevel - zoomFriction * (minZoomLevel / 3);
            }
          } else if (zoomLevel > maxZoomLevel) {
            zoomFriction = (zoomLevel - maxZoomLevel) / (minZoomLevel * 6);
            if (zoomFriction > 1) {
              zoomFriction = 1;
            }
            zoomLevel = maxZoomLevel + zoomFriction * minZoomLevel;
          }
          if (zoomFriction < 0) {
            zoomFriction = 0;
          }
          _currPointsDistance = pointsDistance;
          _findCenterOfPoints(p, p2, _centerPoint);
          _currPanDist.x += _centerPoint.x - _currCenterPoint.x;
          _currPanDist.y += _centerPoint.y - _currCenterPoint.y;
          _equalizePoints(_currCenterPoint, _centerPoint);
          _panOffset.x = _calculatePanOffset("x", zoomLevel);
          _panOffset.y = _calculatePanOffset("y", zoomLevel);
          _isZoomingIn = zoomLevel > _currZoomLevel;
          _currZoomLevel = zoomLevel;
          _applyCurrentZoomPan();
        } else {
          if (!_direction) {
            return;
          }
          if (_isFirstMove) {
            _isFirstMove = false;
            if (Math.abs(delta.x) >= DIRECTION_CHECK_OFFSET) {
              delta.x -= _currentPoints[0].x - _startPoint.x;
            }
            if (Math.abs(delta.y) >= DIRECTION_CHECK_OFFSET) {
              delta.y -= _currentPoints[0].y - _startPoint.y;
            }
          }
          _currPoint.x = p.x;
          _currPoint.y = p.y;
          if (delta.x === 0 && delta.y === 0) {
            return;
          }
          if (_direction === "v" && _options.closeOnVerticalDrag) {
            if (!_canPan()) {
              _currPanDist.y += delta.y;
              _panOffset.y += delta.y;
              var opacityRatio = _calculateVerticalDragOpacityRatio();
              _verticalDragInitiated = true;
              _shout("onVerticalDrag", opacityRatio);
              _applyBgOpacity(opacityRatio);
              _applyCurrentZoomPan();
              return;
            }
          }
          _pushPosPoint(_getCurrentTime(), p.x, p.y);
          _moved = true;
          _currPanBounds = self.currItem.bounds;
          var mainScrollChanged = _panOrMoveMainScroll("x", delta);
          if (!mainScrollChanged) {
            _panOrMoveMainScroll("y", delta);
            _roundPoint(_panOffset);
            _applyCurrentZoomPan();
          }
        }
      },
      _onDragRelease = function (e) {
        if (_features.isOldAndroid) {
          if (_oldAndroidTouchEndTimeout && e.type === "mouseup") {
            return;
          }
          if (e.type.indexOf("touch") > -1) {
            clearTimeout(_oldAndroidTouchEndTimeout);
            _oldAndroidTouchEndTimeout = setTimeout(function () {
              _oldAndroidTouchEndTimeout = 0;
            }, 600);
          }
        }
        _shout("pointerUp");
        if (_preventDefaultEventBehaviour(e, false)) {
          e.preventDefault();
        }
        var releasePoint;
        if (_pointerEventEnabled) {
          var pointerIndex = framework.arraySearch(
            _currPointers,
            e.pointerId,
            "id",
          );
          if (pointerIndex > -1) {
            releasePoint = _currPointers.splice(pointerIndex, 1)[0];
            if (navigator.msPointerEnabled) {
              var MSPOINTER_TYPES = { 4: "mouse", 2: "touch", 3: "pen" };
              releasePoint.type = MSPOINTER_TYPES[e.pointerType];
              if (!releasePoint.type) {
                releasePoint.type = e.pointerType || "mouse";
              }
            } else {
              releasePoint.type = e.pointerType || "mouse";
            }
          }
        }
        var touchList = _getTouchPoints(e),
          gestureType,
          numPoints = touchList.length;
        if (e.type === "mouseup") {
          numPoints = 0;
        }
        if (numPoints === 2) {
          _currentPoints = null;
          return true;
        }
        if (numPoints === 1) {
          _equalizePoints(_startPoint, touchList[0]);
        }
        if (numPoints === 0 && !_direction && !_mainScrollAnimating) {
          if (!releasePoint) {
            if (e.type === "mouseup") {
              releasePoint = { x: e.pageX, y: e.pageY, type: "mouse" };
            } else if (e.changedTouches && e.changedTouches[0]) {
              releasePoint = {
                x: e.changedTouches[0].pageX,
                y: e.changedTouches[0].pageY,
                type: "touch",
              };
            }
          }
          _shout("touchRelease", e, releasePoint);
        }
        var releaseTimeDiff = -1;
        if (numPoints === 0) {
          _isDragging = false;
          framework.unbind(window, _upMoveEvents, self);
          _stopDragUpdateLoop();
          if (_isZooming) {
            releaseTimeDiff = 0;
          } else if (_lastReleaseTime !== -1) {
            releaseTimeDiff = _getCurrentTime() - _lastReleaseTime;
          }
        }
        _lastReleaseTime = numPoints === 1 ? _getCurrentTime() : -1;
        if (releaseTimeDiff !== -1 && releaseTimeDiff < 150) {
          gestureType = "zoom";
        } else {
          gestureType = "swipe";
        }
        if (_isZooming && numPoints < 2) {
          _isZooming = false;
          if (numPoints === 1) {
            gestureType = "zoomPointerUp";
          }
          _shout("zoomGestureEnded");
        }
        _currentPoints = null;
        if (
          !_moved &&
          !_zoomStarted &&
          !_mainScrollAnimating &&
          !_verticalDragInitiated
        ) {
          return;
        }
        _stopAllAnimations();
        if (!_releaseAnimData) {
          _releaseAnimData = _initDragReleaseAnimationData();
        }
        _releaseAnimData.calculateSwipeSpeed("x");
        if (_verticalDragInitiated) {
          var opacityRatio = _calculateVerticalDragOpacityRatio();
          if (opacityRatio < _options.verticalDragRange) {
            self.close();
          } else {
            var initalPanY = _panOffset.y,
              initialBgOpacity = _bgOpacity;
            _animateProp(
              "verticalDrag",
              0,
              1,
              300,
              framework.easing.cubic.out,
              function (now) {
                _panOffset.y =
                  (self.currItem.initialPosition.y - initalPanY) * now +
                  initalPanY;
                _applyBgOpacity(
                  (1 - initialBgOpacity) * now + initialBgOpacity,
                );
                _applyCurrentZoomPan();
              },
            );
            _shout("onVerticalDrag", 1);
          }
          return;
        }
        if ((_mainScrollShifted || _mainScrollAnimating) && numPoints === 0) {
          var itemChanged = _finishSwipeMainScrollGesture(
            gestureType,
            _releaseAnimData,
          );
          if (itemChanged) {
            return;
          }
          gestureType = "zoomPointerUp";
        }
        if (_mainScrollAnimating) {
          return;
        }
        if (gestureType !== "swipe") {
          _completeZoomGesture();
          return;
        }
        if (!_mainScrollShifted && _currZoomLevel > self.currItem.fitRatio) {
          _completePanGesture(_releaseAnimData);
        }
      },
      _initDragReleaseAnimationData = function () {
        var lastFlickDuration, tempReleasePos;
        var s = {
          lastFlickOffset: {},
          lastFlickDist: {},
          lastFlickSpeed: {},
          slowDownRatio: {},
          slowDownRatioReverse: {},
          speedDecelerationRatio: {},
          speedDecelerationRatioAbs: {},
          distanceOffset: {},
          backAnimDestination: {},
          backAnimStarted: {},
          calculateSwipeSpeed: function (axis) {
            if (_posPoints.length > 1) {
              lastFlickDuration =
                _getCurrentTime() - _gestureCheckSpeedTime + 50;
              tempReleasePos = _posPoints[_posPoints.length - 2][axis];
            } else {
              lastFlickDuration = _getCurrentTime() - _gestureStartTime;
              tempReleasePos = _startPoint[axis];
            }
            s.lastFlickOffset[axis] = _currPoint[axis] - tempReleasePos;
            s.lastFlickDist[axis] = Math.abs(s.lastFlickOffset[axis]);
            if (s.lastFlickDist[axis] > 20) {
              s.lastFlickSpeed[axis] =
                s.lastFlickOffset[axis] / lastFlickDuration;
            } else {
              s.lastFlickSpeed[axis] = 0;
            }
            if (Math.abs(s.lastFlickSpeed[axis]) < 0.1) {
              s.lastFlickSpeed[axis] = 0;
            }
            s.slowDownRatio[axis] = 0.95;
            s.slowDownRatioReverse[axis] = 1 - s.slowDownRatio[axis];
            s.speedDecelerationRatio[axis] = 1;
          },
          calculateOverBoundsAnimOffset: function (axis, speed) {
            if (!s.backAnimStarted[axis]) {
              if (_panOffset[axis] > _currPanBounds.min[axis]) {
                s.backAnimDestination[axis] = _currPanBounds.min[axis];
              } else if (_panOffset[axis] < _currPanBounds.max[axis]) {
                s.backAnimDestination[axis] = _currPanBounds.max[axis];
              }
              if (s.backAnimDestination[axis] !== undefined) {
                s.slowDownRatio[axis] = 0.7;
                s.slowDownRatioReverse[axis] = 1 - s.slowDownRatio[axis];
                if (s.speedDecelerationRatioAbs[axis] < 0.05) {
                  s.lastFlickSpeed[axis] = 0;
                  s.backAnimStarted[axis] = true;
                  _animateProp(
                    "bounceZoomPan" + axis,
                    _panOffset[axis],
                    s.backAnimDestination[axis],
                    speed || 300,
                    framework.easing.sine.out,
                    function (pos) {
                      _panOffset[axis] = pos;
                      _applyCurrentZoomPan();
                    },
                  );
                }
              }
            }
          },
          calculateAnimOffset: function (axis) {
            if (!s.backAnimStarted[axis]) {
              s.speedDecelerationRatio[axis] =
                s.speedDecelerationRatio[axis] *
                (s.slowDownRatio[axis] +
                  s.slowDownRatioReverse[axis] -
                  (s.slowDownRatioReverse[axis] * s.timeDiff) / 10);
              s.speedDecelerationRatioAbs[axis] = Math.abs(
                s.lastFlickSpeed[axis] * s.speedDecelerationRatio[axis],
              );
              s.distanceOffset[axis] =
                s.lastFlickSpeed[axis] *
                s.speedDecelerationRatio[axis] *
                s.timeDiff;
              _panOffset[axis] += s.distanceOffset[axis];
            }
          },
          panAnimLoop: function () {
            if (_animations.zoomPan) {
              _animations.zoomPan.raf = _requestAF(s.panAnimLoop);
              s.now = _getCurrentTime();
              s.timeDiff = s.now - s.lastNow;
              s.lastNow = s.now;
              s.calculateAnimOffset("x");
              s.calculateAnimOffset("y");
              _applyCurrentZoomPan();
              s.calculateOverBoundsAnimOffset("x");
              s.calculateOverBoundsAnimOffset("y");
              if (
                s.speedDecelerationRatioAbs.x < 0.05 &&
                s.speedDecelerationRatioAbs.y < 0.05
              ) {
                _panOffset.x = Math.round(_panOffset.x);
                _panOffset.y = Math.round(_panOffset.y);
                _applyCurrentZoomPan();
                _stopAnimation("zoomPan");
                return;
              }
            }
          },
        };
        return s;
      },
      _completePanGesture = function (animData) {
        animData.calculateSwipeSpeed("y");
        _currPanBounds = self.currItem.bounds;
        animData.backAnimDestination = {};
        animData.backAnimStarted = {};
        if (
          Math.abs(animData.lastFlickSpeed.x) <= 0.05 &&
          Math.abs(animData.lastFlickSpeed.y) <= 0.05
        ) {
          animData.speedDecelerationRatioAbs.x =
            animData.speedDecelerationRatioAbs.y = 0;
          animData.calculateOverBoundsAnimOffset("x");
          animData.calculateOverBoundsAnimOffset("y");
          return true;
        }
        _registerStartAnimation("zoomPan");
        animData.lastNow = _getCurrentTime();
        animData.panAnimLoop();
      },
      _finishSwipeMainScrollGesture = function (gestureType, _releaseAnimData) {
        var itemChanged;
        if (!_mainScrollAnimating) {
          _currZoomedItemIndex = _currentItemIndex;
        }
        var itemsDiff;
        if (gestureType === "swipe") {
          var totalShiftDist = _currPoint.x - _startPoint.x,
            isFastLastFlick = _releaseAnimData.lastFlickDist.x < 10;
          if (
            totalShiftDist > MIN_SWIPE_DISTANCE &&
            (isFastLastFlick || _releaseAnimData.lastFlickOffset.x > 20)
          ) {
            itemsDiff = -1;
          } else if (
            totalShiftDist < -MIN_SWIPE_DISTANCE &&
            (isFastLastFlick || _releaseAnimData.lastFlickOffset.x < -20)
          ) {
            itemsDiff = 1;
          }
        }
        var nextCircle;
        if (itemsDiff) {
          _currentItemIndex += itemsDiff;
          if (_currentItemIndex < 0) {
            _currentItemIndex = _options.loop ? _getNumItems() - 1 : 0;
            nextCircle = true;
          } else if (_currentItemIndex >= _getNumItems()) {
            _currentItemIndex = _options.loop ? 0 : _getNumItems() - 1;
            nextCircle = true;
          }
          if (!nextCircle || _options.loop) {
            _indexDiff += itemsDiff;
            _currPositionIndex -= itemsDiff;
            itemChanged = true;
          }
        }
        var animateToX = _slideSize.x * _currPositionIndex;
        var animateToDist = Math.abs(animateToX - _mainScrollPos.x);
        var finishAnimDuration;
        if (
          !itemChanged &&
          animateToX > _mainScrollPos.x !==
            _releaseAnimData.lastFlickSpeed.x > 0
        ) {
          finishAnimDuration = 333;
        } else {
          finishAnimDuration =
            Math.abs(_releaseAnimData.lastFlickSpeed.x) > 0
              ? animateToDist / Math.abs(_releaseAnimData.lastFlickSpeed.x)
              : 333;
          finishAnimDuration = Math.min(finishAnimDuration, 400);
          finishAnimDuration = Math.max(finishAnimDuration, 250);
        }
        if (_currZoomedItemIndex === _currentItemIndex) {
          itemChanged = false;
        }
        _mainScrollAnimating = true;
        _shout("mainScrollAnimStart");
        _animateProp(
          "mainScroll",
          _mainScrollPos.x,
          animateToX,
          finishAnimDuration,
          framework.easing.cubic.out,
          _moveMainScroll,
          function () {
            _stopAllAnimations();
            _mainScrollAnimating = false;
            _currZoomedItemIndex = -1;
            if (itemChanged || _currZoomedItemIndex !== _currentItemIndex) {
              self.updateCurrItem();
            }
            _shout("mainScrollAnimComplete");
          },
        );
        if (itemChanged) {
          self.updateCurrItem(true);
        }
        return itemChanged;
      },
      _calculateZoomLevel = function (touchesDistance) {
        return (1 / _startPointsDistance) * touchesDistance * _startZoomLevel;
      },
      _completeZoomGesture = function () {
        var destZoomLevel = _currZoomLevel,
          minZoomLevel = _getMinZoomLevel(),
          maxZoomLevel = _getMaxZoomLevel();
        if (_currZoomLevel < minZoomLevel) {
          destZoomLevel = minZoomLevel;
        } else if (_currZoomLevel > maxZoomLevel) {
          destZoomLevel = maxZoomLevel;
        }
        var destOpacity = 1,
          onUpdate,
          initialOpacity = _bgOpacity;
        if (
          _opacityChanged &&
          !_isZoomingIn &&
          !_wasOverInitialZoom &&
          _currZoomLevel < minZoomLevel
        ) {
          self.close();
          return true;
        }
        if (_opacityChanged) {
          onUpdate = function (now) {
            _applyBgOpacity(
              (destOpacity - initialOpacity) * now + initialOpacity,
            );
          };
        }
        self.zoomTo(
          destZoomLevel,
          0,
          200,
          framework.easing.cubic.out,
          onUpdate,
        );
        return true;
      };
    _registerModule("Gestures", {
      publicMethods: {
        initGestures: function () {
          var addEventNames = function (pref, down, move, up, cancel) {
            _dragStartEvent = pref + down;
            _dragMoveEvent = pref + move;
            _dragEndEvent = pref + up;
            if (cancel) {
              _dragCancelEvent = pref + cancel;
            } else {
              _dragCancelEvent = "";
            }
          };
          _pointerEventEnabled = _features.pointerEvent;
          if (_pointerEventEnabled && _features.touch) {
            _features.touch = false;
          }
          if (_pointerEventEnabled) {
            if (navigator.msPointerEnabled) {
              addEventNames("MSPointer", "Down", "Move", "Up", "Cancel");
            } else {
              addEventNames("pointer", "down", "move", "up", "cancel");
            }
          } else if (_features.touch) {
            addEventNames("touch", "start", "move", "end", "cancel");
            _likelyTouchDevice = true;
          } else {
            addEventNames("mouse", "down", "move", "up");
          }
          _upMoveEvents =
            _dragMoveEvent + " " + _dragEndEvent + " " + _dragCancelEvent;
          _downEvents = _dragStartEvent;
          if (_pointerEventEnabled && !_likelyTouchDevice) {
            _likelyTouchDevice =
              navigator.maxTouchPoints > 1 || navigator.msMaxTouchPoints > 1;
          }
          self.likelyTouchDevice = _likelyTouchDevice;
          _globalEventHandlers[_dragStartEvent] = _onDragStart;
          _globalEventHandlers[_dragMoveEvent] = _onDragMove;
          _globalEventHandlers[_dragEndEvent] = _onDragRelease;
          if (_dragCancelEvent) {
            _globalEventHandlers[_dragCancelEvent] =
              _globalEventHandlers[_dragEndEvent];
          }
          if (_features.touch) {
            _downEvents += " mousedown";
            _upMoveEvents += " mousemove mouseup";
            _globalEventHandlers.mousedown =
              _globalEventHandlers[_dragStartEvent];
            _globalEventHandlers.mousemove =
              _globalEventHandlers[_dragMoveEvent];
            _globalEventHandlers.mouseup = _globalEventHandlers[_dragEndEvent];
          }
          if (!_likelyTouchDevice) {
            _options.allowPanToNext = false;
          }
        },
      },
    });
    var _showOrHideTimeout,
      _showOrHide = function (item, img, out, completeFn) {
        if (_showOrHideTimeout) {
          clearTimeout(_showOrHideTimeout);
        }
        _initialZoomRunning = true;
        _initialContentSet = true;
        var thumbBounds;
        if (item.initialLayout) {
          thumbBounds = item.initialLayout;
          item.initialLayout = null;
        } else {
          thumbBounds =
            _options.getThumbBoundsFn &&
            _options.getThumbBoundsFn(_currentItemIndex);
        }
        var duration = out
          ? _options.hideAnimationDuration
          : _options.showAnimationDuration;
        var onComplete = function () {
          _stopAnimation("initialZoom");
          if (!out) {
            _applyBgOpacity(1);
            if (img) {
              img.style.display = "block";
            }
            framework.addClass(template, "pswp--animated-in");
            _shout("initialZoom" + (out ? "OutEnd" : "InEnd"));
          } else {
            self.template.removeAttribute("style");
            self.bg.removeAttribute("style");
          }
          if (completeFn) {
            completeFn();
          }
          _initialZoomRunning = false;
        };
        if (!duration || !thumbBounds || thumbBounds.x === undefined) {
          _shout("initialZoom" + (out ? "Out" : "In"));
          _currZoomLevel = item.initialZoomLevel;
          _equalizePoints(_panOffset, item.initialPosition);
          _applyCurrentZoomPan();
          template.style.opacity = out ? 0 : 1;
          _applyBgOpacity(1);
          if (duration) {
            setTimeout(function () {
              onComplete();
            }, duration);
          } else {
            onComplete();
          }
          return;
        }
        var startAnimation = function () {
          var closeWithRaf = _closedByScroll,
            fadeEverything =
              !self.currItem.src ||
              self.currItem.loadError ||
              _options.showHideOpacity;
          if (item.miniImg) {
            item.miniImg.style.webkitBackfaceVisibility = "hidden";
          }
          if (!out) {
            _currZoomLevel = thumbBounds.w / item.w;
            _panOffset.x = thumbBounds.x;
            _panOffset.y = thumbBounds.y - _initalWindowScrollY;
            self[fadeEverything ? "template" : "bg"].style.opacity = 0.001;
            _applyCurrentZoomPan();
          }
          _registerStartAnimation("initialZoom");
          if (out && !closeWithRaf) {
            framework.removeClass(template, "pswp--animated-in");
          }
          if (fadeEverything) {
            if (out) {
              framework[(closeWithRaf ? "remove" : "add") + "Class"](
                template,
                "pswp--animate_opacity",
              );
            } else {
              setTimeout(function () {
                framework.addClass(template, "pswp--animate_opacity");
              }, 30);
            }
          }
          _showOrHideTimeout = setTimeout(
            function () {
              _shout("initialZoom" + (out ? "Out" : "In"));
              if (!out) {
                _currZoomLevel = item.initialZoomLevel;
                _equalizePoints(_panOffset, item.initialPosition);
                _applyCurrentZoomPan();
                _applyBgOpacity(1);
                if (fadeEverything) {
                  template.style.opacity = 1;
                } else {
                  _applyBgOpacity(1);
                }
                _showOrHideTimeout = setTimeout(onComplete, duration + 20);
              } else {
                var destZoomLevel = thumbBounds.w / item.w,
                  initialPanOffset = { x: _panOffset.x, y: _panOffset.y },
                  initialZoomLevel = _currZoomLevel,
                  initalBgOpacity = _bgOpacity,
                  onUpdate = function (now) {
                    if (now === 1) {
                      _currZoomLevel = destZoomLevel;
                      _panOffset.x = thumbBounds.x;
                      _panOffset.y = thumbBounds.y - _currentWindowScrollY;
                    } else {
                      _currZoomLevel =
                        (destZoomLevel - initialZoomLevel) * now +
                        initialZoomLevel;
                      _panOffset.x =
                        (thumbBounds.x - initialPanOffset.x) * now +
                        initialPanOffset.x;
                      _panOffset.y =
                        (thumbBounds.y -
                          _currentWindowScrollY -
                          initialPanOffset.y) *
                          now +
                        initialPanOffset.y;
                    }
                    _applyCurrentZoomPan();
                    if (fadeEverything) {
                      template.style.opacity = 1 - now;
                    } else {
                      _applyBgOpacity(initalBgOpacity - now * initalBgOpacity);
                    }
                  };
                if (closeWithRaf) {
                  _animateProp(
                    "initialZoom",
                    0,
                    1,
                    duration,
                    framework.easing.cubic.out,
                    onUpdate,
                    onComplete,
                  );
                } else {
                  onUpdate(1);
                  _showOrHideTimeout = setTimeout(onComplete, duration + 20);
                }
              }
            },
            out ? 25 : 90,
          );
        };
        startAnimation();
      };
    var _items,
      _tempPanAreaSize = {},
      _imagesToAppendPool = [],
      _initialContentSet,
      _initialZoomRunning,
      _controllerDefaultOptions = {
        index: 0,
        errorMsg:
          '<div class="pswp__error-msg"><a href="%url%" target="_blank">The image</a> could not be loaded.</div>',
        forceProgressiveLoading: false,
        preload: [1, 1],
        getNumItemsFn: function () {
          return _items.length;
        },
      };
    var _getItemAt,
      _getNumItems,
      _initialIsLoop,
      _getZeroBounds = function () {
        return {
          center: { x: 0, y: 0 },
          max: { x: 0, y: 0 },
          min: { x: 0, y: 0 },
        };
      },
      _calculateSingleItemPanBounds = function (
        item,
        realPanElementW,
        realPanElementH,
      ) {
        var bounds = item.bounds;
        bounds.center.x = Math.round(
          (_tempPanAreaSize.x - realPanElementW) / 2,
        );
        bounds.center.y =
          Math.round((_tempPanAreaSize.y - realPanElementH) / 2) +
          item.vGap.top;
        bounds.max.x =
          realPanElementW > _tempPanAreaSize.x
            ? Math.round(_tempPanAreaSize.x - realPanElementW)
            : bounds.center.x;
        bounds.max.y =
          realPanElementH > _tempPanAreaSize.y
            ? Math.round(_tempPanAreaSize.y - realPanElementH) + item.vGap.top
            : bounds.center.y;
        bounds.min.x =
          realPanElementW > _tempPanAreaSize.x ? 0 : bounds.center.x;
        bounds.min.y =
          realPanElementH > _tempPanAreaSize.y
            ? item.vGap.top
            : bounds.center.y;
      },
      _calculateItemSize = function (item, viewportSize, zoomLevel) {
        if (item.src && !item.loadError) {
          var isInitial = !zoomLevel;
          if (isInitial) {
            if (!item.vGap) {
              item.vGap = { top: 0, bottom: 0 };
            }
            _shout("parseVerticalMargin", item);
          }
          _tempPanAreaSize.x = viewportSize.x;
          _tempPanAreaSize.y =
            viewportSize.y - item.vGap.top - item.vGap.bottom;
          if (isInitial) {
            var hRatio = _tempPanAreaSize.x / item.w;
            var vRatio = _tempPanAreaSize.y / item.h;
            item.fitRatio = hRatio < vRatio ? hRatio : vRatio;
            var scaleMode = _options.scaleMode;
            if (scaleMode === "orig") {
              zoomLevel = 1;
            } else if (scaleMode === "fit") {
              zoomLevel = item.fitRatio;
            }
            if (zoomLevel > 1) {
              zoomLevel = 1;
            }
            item.initialZoomLevel = zoomLevel;
            if (!item.bounds) {
              item.bounds = _getZeroBounds();
            }
          }
          if (!zoomLevel) {
            return;
          }
          _calculateSingleItemPanBounds(
            item,
            item.w * zoomLevel,
            item.h * zoomLevel,
          );
          if (isInitial && zoomLevel === item.initialZoomLevel) {
            item.initialPosition = item.bounds.center;
          }
          return item.bounds;
        } else {
          item.w = item.h = 0;
          item.initialZoomLevel = item.fitRatio = 1;
          item.bounds = _getZeroBounds();
          item.initialPosition = item.bounds.center;
          return item.bounds;
        }
      },
      _appendImage = function (
        index,
        item,
        baseDiv,
        img,
        preventAnimation,
        keepPlaceholder,
      ) {
        if (item.loadError) {
          return;
        }
        if (img) {
          item.imageAppended = true;
          _setImageSize(
            item,
            img,
            item === self.currItem && _renderMaxResolution,
          );
          baseDiv.appendChild(img);
          if (keepPlaceholder) {
            setTimeout(function () {
              if (item && item.loaded && item.placeholder) {
                item.placeholder.style.display = "none";
                item.placeholder = null;
              }
            }, 500);
          }
        }
      },
      _preloadImage = function (item) {
        item.loading = true;
        item.loaded = false;
        var img = (item.img = framework.createEl("pswp__img", "img"));
        var onComplete = function () {
          item.loading = false;
          item.loaded = true;
          if (item.loadComplete) {
            item.loadComplete(item);
          } else {
            item.img = null;
          }
          img.onload = img.onerror = null;
          img = null;
        };
        img.onload = onComplete;
        img.onerror = function () {
          item.loadError = true;
          onComplete();
        };
        img.src = item.src;
        return img;
      },
      _checkForError = function (item, cleanUp) {
        if (item.src && item.loadError && item.container) {
          if (cleanUp) {
            item.container.innerHTML = "";
          }
          item.container.innerHTML = _options.errorMsg.replace(
            "%url%",
            item.src,
          );
          return true;
        }
      },
      _setImageSize = function (item, img, maxRes) {
        if (!item.src) {
          return;
        }
        if (!img) {
          img = item.container.lastChild;
        }
        var w = maxRes ? item.w : Math.round(item.w * item.fitRatio),
          h = maxRes ? item.h : Math.round(item.h * item.fitRatio);
        if (item.placeholder && !item.loaded) {
          item.placeholder.style.width = w + "px";
          item.placeholder.style.height = h + "px";
        }
        img.style.width = w + "px";
        img.style.height = h + "px";
      },
      _appendImagesPool = function () {
        if (_imagesToAppendPool.length) {
          var poolItem;
          for (var i = 0; i < _imagesToAppendPool.length; i++) {
            poolItem = _imagesToAppendPool[i];
            if (poolItem.holder.index === poolItem.index) {
              _appendImage(
                poolItem.index,
                poolItem.item,
                poolItem.baseDiv,
                poolItem.img,
                false,
                poolItem.clearPlaceholder,
              );
            }
          }
          _imagesToAppendPool = [];
        }
      };
    _registerModule("Controller", {
      publicMethods: {
        lazyLoadItem: function (index) {
          index = _getLoopedId(index);
          var item = _getItemAt(index);
          if (!item || ((item.loaded || item.loading) && !_itemsNeedUpdate)) {
            return;
          }
          _shout("gettingData", index, item);
          if (!item.src) {
            return;
          }
          _preloadImage(item);
        },
        initController: function () {
          framework.extend(_options, _controllerDefaultOptions, true);
          self.items = _items = items;
          _getItemAt = self.getItemAt;
          _getNumItems = _options.getNumItemsFn;
          _initialIsLoop = _options.loop;
          if (_getNumItems() < 3) {
            _options.loop = false;
          }
          _listen("beforeChange", function (diff) {
            var p = _options.preload,
              isNext = diff === null ? true : diff >= 0,
              preloadBefore = Math.min(p[0], _getNumItems()),
              preloadAfter = Math.min(p[1], _getNumItems()),
              i;
            for (i = 1; i <= (isNext ? preloadAfter : preloadBefore); i++) {
              self.lazyLoadItem(_currentItemIndex + i);
            }
            for (i = 1; i <= (isNext ? preloadBefore : preloadAfter); i++) {
              self.lazyLoadItem(_currentItemIndex - i);
            }
          });
          _listen("initialLayout", function () {
            self.currItem.initialLayout =
              _options.getThumbBoundsFn &&
              _options.getThumbBoundsFn(_currentItemIndex);
          });
          _listen("mainScrollAnimComplete", _appendImagesPool);
          _listen("initialZoomInEnd", _appendImagesPool);
          _listen("destroy", function () {
            var item;
            for (var i = 0; i < _items.length; i++) {
              item = _items[i];
              if (item.container) {
                item.container = null;
              }
              if (item.placeholder) {
                item.placeholder = null;
              }
              if (item.img) {
                item.img = null;
              }
              if (item.preloader) {
                item.preloader = null;
              }
              if (item.loadError) {
                item.loaded = item.loadError = false;
              }
            }
            _imagesToAppendPool = null;
          });
        },
        getItemAt: function (index) {
          if (index >= 0) {
            return _items[index] !== undefined ? _items[index] : false;
          }
          return false;
        },
        allowProgressiveImg: function () {
          return (
            _options.forceProgressiveLoading ||
            !_likelyTouchDevice ||
            _options.mouseUsed ||
            screen.width > 1200
          );
        },
        setContent: function (holder, index) {
          if (_options.loop) {
            index = _getLoopedId(index);
          }
          var prevItem = self.getItemAt(holder.index);
          if (prevItem) {
            prevItem.container = null;
          }
          var item = self.getItemAt(index),
            img;
          if (!item) {
            holder.el.innerHTML = "";
            return;
          }
          _shout("gettingData", index, item);
          holder.index = index;
          holder.item = item;
          var baseDiv = (item.container =
            framework.createEl("pswp__zoom-wrap"));
          if (!item.src && item.html) {
            if (item.html.tagName) {
              baseDiv.appendChild(item.html);
            } else {
              baseDiv.innerHTML = item.html;
            }
          }
          _checkForError(item);
          _calculateItemSize(item, _viewportSize);
          if (item.src && !item.loadError && !item.loaded) {
            item.loadComplete = function (item) {
              if (!_isOpen) {
                return;
              }
              if (holder && holder.index === index) {
                if (_checkForError(item, true)) {
                  item.loadComplete = item.img = null;
                  _calculateItemSize(item, _viewportSize);
                  _applyZoomPanToItem(item);
                  if (holder.index === _currentItemIndex) {
                    self.updateCurrZoomItem();
                  }
                  return;
                }
                if (!item.imageAppended) {
                  if (
                    _features.transform &&
                    (_mainScrollAnimating || _initialZoomRunning)
                  ) {
                    _imagesToAppendPool.push({
                      item: item,
                      baseDiv: baseDiv,
                      img: item.img,
                      index: index,
                      holder: holder,
                      clearPlaceholder: true,
                    });
                  } else {
                    _appendImage(
                      index,
                      item,
                      baseDiv,
                      item.img,
                      _mainScrollAnimating || _initialZoomRunning,
                      true,
                    );
                  }
                } else {
                  if (!_initialZoomRunning && item.placeholder) {
                    item.placeholder.style.display = "none";
                    item.placeholder = null;
                  }
                }
              }
              item.loadComplete = null;
              item.img = null;
              _shout("imageLoadComplete", index, item);
            };
            if (framework.features.transform) {
              var placeholderClassName = "pswp__img pswp__img--placeholder";
              placeholderClassName += item.msrc
                ? ""
                : " pswp__img--placeholder--blank";
              var placeholder = framework.createEl(
                placeholderClassName,
                item.msrc ? "img" : "",
              );
              if (item.msrc) {
                placeholder.src = item.msrc;
              }
              _setImageSize(item, placeholder);
              baseDiv.appendChild(placeholder);
              item.placeholder = placeholder;
            }
            if (!item.loading) {
              _preloadImage(item);
            }
            if (self.allowProgressiveImg()) {
              if (!_initialContentSet && _features.transform) {
                _imagesToAppendPool.push({
                  item: item,
                  baseDiv: baseDiv,
                  img: item.img,
                  index: index,
                  holder: holder,
                });
              } else {
                _appendImage(index, item, baseDiv, item.img, true, true);
              }
            }
          } else if (item.src && !item.loadError) {
            img = framework.createEl("pswp__img", "img");
            img.style.opacity = 1;
            img.src = item.src;
            _setImageSize(item, img);
            _appendImage(index, item, baseDiv, img, true);
          }
          if (!_initialContentSet && index === _currentItemIndex) {
            _currZoomElementStyle = baseDiv.style;
            _showOrHide(item, img || item.img);
          } else {
            _applyZoomPanToItem(item);
          }
          holder.el.innerHTML = "";
          holder.el.appendChild(baseDiv);
        },
        cleanSlide: function (item) {
          if (item.img) {
            item.img.onload = item.img.onerror = null;
          }
          item.loaded = item.loading = item.img = item.imageAppended = false;
        },
      },
    });
    var tapTimer,
      tapReleasePoint = {},
      _dispatchTapEvent = function (origEvent, releasePoint, pointerType) {
        var e = document.createEvent("CustomEvent"),
          eDetail = {
            origEvent: origEvent,
            target: origEvent.target,
            releasePoint: releasePoint,
            pointerType: pointerType || "touch",
          };
        e.initCustomEvent("pswpTap", true, true, eDetail);
        origEvent.target.dispatchEvent(e);
      };
    _registerModule("Tap", {
      publicMethods: {
        initTap: function () {
          _listen("firstTouchStart", self.onTapStart);
          _listen("touchRelease", self.onTapRelease);
          _listen("destroy", function () {
            tapReleasePoint = {};
            tapTimer = null;
          });
        },
        onTapStart: function (touchList) {
          if (touchList.length > 1) {
            clearTimeout(tapTimer);
            tapTimer = null;
          }
        },
        onTapRelease: function (e, releasePoint) {
          if (!releasePoint) {
            return;
          }
          if (!_moved && !_isMultitouch && !_numAnimations) {
            var p0 = releasePoint;
            if (tapTimer) {
              clearTimeout(tapTimer);
              tapTimer = null;
              if (_isNearbyPoints(p0, tapReleasePoint)) {
                _shout("doubleTap", p0);
                return;
              }
            }
            if (releasePoint.type === "mouse") {
              _dispatchTapEvent(e, releasePoint, "mouse");
              return;
            }
            var clickedTagName = e.target.tagName.toUpperCase();
            if (
              clickedTagName === "BUTTON" ||
              framework.hasClass(e.target, "pswp__single-tap")
            ) {
              _dispatchTapEvent(e, releasePoint);
              return;
            }
            _equalizePoints(tapReleasePoint, p0);
            tapTimer = setTimeout(function () {
              _dispatchTapEvent(e, releasePoint);
              tapTimer = null;
            }, 300);
          }
        },
      },
    });
    var _wheelDelta;
    _registerModule("DesktopZoom", {
      publicMethods: {
        initDesktopZoom: function () {
          if (_oldIE) {
            return;
          }
          if (_likelyTouchDevice) {
            _listen("mouseUsed", function () {
              self.setupDesktopZoom();
            });
          } else {
            self.setupDesktopZoom(true);
          }
        },
        setupDesktopZoom: function (onInit) {
          _wheelDelta = {};
          var events = "wheel mousewheel DOMMouseScroll";
          _listen("bindEvents", function () {
            framework.bind(template, events, self.handleMouseWheel);
          });
          _listen("unbindEvents", function () {
            if (_wheelDelta) {
              framework.unbind(template, events, self.handleMouseWheel);
            }
          });
          self.mouseZoomedIn = false;
          var hasDraggingClass,
            updateZoomable = function () {
              if (self.mouseZoomedIn) {
                framework.removeClass(template, "pswp--zoomed-in");
                self.mouseZoomedIn = false;
              }
              if (_currZoomLevel < 1) {
                framework.addClass(template, "pswp--zoom-allowed");
              } else {
                framework.removeClass(template, "pswp--zoom-allowed");
              }
              removeDraggingClass();
            },
            removeDraggingClass = function () {
              if (hasDraggingClass) {
                framework.removeClass(template, "pswp--dragging");
                hasDraggingClass = false;
              }
            };
          _listen("resize", updateZoomable);
          _listen("afterChange", updateZoomable);
          _listen("pointerDown", function () {
            if (self.mouseZoomedIn) {
              hasDraggingClass = true;
              framework.addClass(template, "pswp--dragging");
            }
          });
          _listen("pointerUp", removeDraggingClass);
          if (!onInit) {
            updateZoomable();
          }
        },
        handleMouseWheel: function (e) {
          if (_currZoomLevel <= self.currItem.fitRatio) {
            if (_options.modal) {
              if (!_options.closeOnScroll || _numAnimations || _isDragging) {
                e.preventDefault();
              } else if (_transformKey && Math.abs(e.deltaY) > 2) {
                _closedByScroll = true;
                self.close();
              }
            }
            return true;
          }
          e.stopPropagation();
          _wheelDelta.x = 0;
          if ("deltaX" in e) {
            if (e.deltaMode === 1) {
              _wheelDelta.x = e.deltaX * 18;
              _wheelDelta.y = e.deltaY * 18;
            } else {
              _wheelDelta.x = e.deltaX;
              _wheelDelta.y = e.deltaY;
            }
          } else if ("wheelDelta" in e) {
            if (e.wheelDeltaX) {
              _wheelDelta.x = -0.16 * e.wheelDeltaX;
            }
            if (e.wheelDeltaY) {
              _wheelDelta.y = -0.16 * e.wheelDeltaY;
            } else {
              _wheelDelta.y = -0.16 * e.wheelDelta;
            }
          } else if ("detail" in e) {
            _wheelDelta.y = e.detail;
          } else {
            return;
          }
          _calculatePanBounds(_currZoomLevel, true);
          var newPanX = _panOffset.x - _wheelDelta.x,
            newPanY = _panOffset.y - _wheelDelta.y;
          if (
            _options.modal ||
            (newPanX <= _currPanBounds.min.x &&
              newPanX >= _currPanBounds.max.x &&
              newPanY <= _currPanBounds.min.y &&
              newPanY >= _currPanBounds.max.y)
          ) {
            e.preventDefault();
          }
          self.panTo(newPanX, newPanY);
        },
        toggleDesktopZoom: function (centerPoint) {
          centerPoint = centerPoint || {
            x: _viewportSize.x / 2 + _offset.x,
            y: _viewportSize.y / 2 + _offset.y,
          };
          var doubleTapZoomLevel = _options.getDoubleTapZoom(
            true,
            self.currItem,
          );
          var zoomOut = _currZoomLevel === doubleTapZoomLevel;
          self.mouseZoomedIn = !zoomOut;
          self.zoomTo(
            zoomOut ? self.currItem.initialZoomLevel : doubleTapZoomLevel,
            centerPoint,
            333,
          );
          framework[(!zoomOut ? "add" : "remove") + "Class"](
            template,
            "pswp--zoomed-in",
          );
        },
      },
    });
    var _historyDefaultOptions = { history: true, galleryUID: 1 };
    var _historyUpdateTimeout,
      _hashChangeTimeout,
      _hashAnimCheckTimeout,
      _hashChangedByScript,
      _hashChangedByHistory,
      _hashReseted,
      _initialHash,
      _historyChanged,
      _closedFromURL,
      _urlChangedOnce,
      _windowLoc,
      _supportsPushState,
      _getHash = function () {
        return _windowLoc.hash.substring(1);
      },
      _cleanHistoryTimeouts = function () {
        if (_historyUpdateTimeout) {
          clearTimeout(_historyUpdateTimeout);
        }
        if (_hashAnimCheckTimeout) {
          clearTimeout(_hashAnimCheckTimeout);
        }
      },
      _parseItemIndexFromURL = function () {
        var hash = _getHash(),
          params = {};
        if (hash.length < 5) {
          return params;
        }
        var i,
          vars = hash.split("&");
        for (i = 0; i < vars.length; i++) {
          if (!vars[i]) {
            continue;
          }
          var pair = vars[i].split("=");
          if (pair.length < 2) {
            continue;
          }
          params[pair[0]] = pair[1];
        }
        if (_options.galleryPIDs) {
          var searchfor = params.pid;
          params.pid = 0;
          for (i = 0; i < _items.length; i++) {
            if (_items[i].pid === searchfor) {
              params.pid = i;
              break;
            }
          }
        } else {
          params.pid = parseInt(params.pid, 10) - 1;
        }
        if (params.pid < 0) {
          params.pid = 0;
        }
        return params;
      },
      _updateHash = function () {
        if (_hashAnimCheckTimeout) {
          clearTimeout(_hashAnimCheckTimeout);
        }
        if (_numAnimations || _isDragging) {
          _hashAnimCheckTimeout = setTimeout(_updateHash, 500);
          return;
        }
        if (_hashChangedByScript) {
          clearTimeout(_hashChangeTimeout);
        } else {
          _hashChangedByScript = true;
        }
        var pid = _currentItemIndex + 1;
        var item = _getItemAt(_currentItemIndex);
        if (item.hasOwnProperty("pid")) {
          pid = item.pid;
        }
        var newHash =
          _initialHash +
          "&" +
          "gid=" +
          _options.galleryUID +
          "&" +
          "pid=" +
          pid;
        if (!_historyChanged) {
          if (_windowLoc.hash.indexOf(newHash) === -1) {
            _urlChangedOnce = true;
          }
        }
        var newURL = _windowLoc.href.split("#")[0] + "#" + newHash;
        if (_supportsPushState) {
          if ("#" + newHash !== window.location.hash) {
            history[_historyChanged ? "replaceState" : "pushState"](
              "",
              document.title,
              newURL,
            );
          }
        } else {
          if (_historyChanged) {
            _windowLoc.replace(newURL);
          } else {
            _windowLoc.hash = newHash;
          }
        }
        _historyChanged = true;
        _hashChangeTimeout = setTimeout(function () {
          _hashChangedByScript = false;
        }, 60);
      };
    _registerModule("History", {
      publicMethods: {
        initHistory: function () {
          framework.extend(_options, _historyDefaultOptions, true);
          if (!_options.history) {
            return;
          }
          _windowLoc = window.location;
          _urlChangedOnce = false;
          _closedFromURL = false;
          _historyChanged = false;
          _initialHash = _getHash();
          _supportsPushState = "pushState" in history;
          if (_initialHash.indexOf("gid=") > -1) {
            _initialHash = _initialHash.split("&gid=")[0];
            _initialHash = _initialHash.split("?gid=")[0];
          }
          _listen("afterChange", self.updateURL);
          _listen("unbindEvents", function () {
            framework.unbind(window, "hashchange", self.onHashChange);
          });
          var returnToOriginal = function () {
            _hashReseted = true;
            if (!_closedFromURL) {
              if (_urlChangedOnce) {
                history.back();
              } else {
                if (_initialHash) {
                  _windowLoc.hash = _initialHash;
                } else {
                  if (_supportsPushState) {
                    history.pushState(
                      "",
                      document.title,
                      _windowLoc.pathname + _windowLoc.search,
                    );
                  } else {
                    _windowLoc.hash = "";
                  }
                }
              }
            }
            _cleanHistoryTimeouts();
          };
          _listen("unbindEvents", function () {
            if (_closedByScroll) {
              returnToOriginal();
            }
          });
          _listen("destroy", function () {
            if (!_hashReseted) {
              returnToOriginal();
            }
          });
          _listen("firstUpdate", function () {
            _currentItemIndex = _parseItemIndexFromURL().pid;
          });
          var index = _initialHash.indexOf("pid=");
          if (index > -1) {
            _initialHash = _initialHash.substring(0, index);
            if (_initialHash.slice(-1) === "&") {
              _initialHash = _initialHash.slice(0, -1);
            }
          }
          setTimeout(function () {
            if (_isOpen) {
              framework.bind(window, "hashchange", self.onHashChange);
            }
          }, 40);
        },
        onHashChange: function () {
          if (_getHash() === _initialHash) {
            _closedFromURL = true;
            self.close();
            return;
          }
          if (!_hashChangedByScript) {
            _hashChangedByHistory = true;
            self.goTo(_parseItemIndexFromURL().pid);
            _hashChangedByHistory = false;
          }
        },
        updateURL: function () {
          _cleanHistoryTimeouts();
          if (_hashChangedByHistory) {
            return;
          }
          if (!_historyChanged) {
            _updateHash();
          } else {
            _historyUpdateTimeout = setTimeout(_updateHash, 800);
          }
        },
      },
    });
    framework.extend(self, publicMethods);
  };
  return PhotoSwipe;
});

/* /droggol_theme_common/static/lib/PhotoSwipe-4.1.3/dist/photoswipe-ui-default.js defined in bundle 'web.assets_frontend_lazy' */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define(factory);
  } else if (typeof exports === "object") {
    module.exports = factory();
  } else {
    root.PhotoSwipeUI_Default = factory();
  }
})(this, function () {
  "use strict";
  var PhotoSwipeUI_Default = function (pswp, framework) {
    var ui = this;
    var _overlayUIUpdated = false,
      _controlsVisible = true,
      _fullscrenAPI,
      _controls,
      _captionContainer,
      _fakeCaptionContainer,
      _indexIndicator,
      _shareButton,
      _shareModal,
      _shareModalHidden = true,
      _initalCloseOnScrollValue,
      _isIdle,
      _listen,
      _loadingIndicator,
      _loadingIndicatorHidden,
      _loadingIndicatorTimeout,
      _galleryHasOneSlide,
      _options,
      _defaultUIOptions = {
        barsSize: { top: 44, bottom: "auto" },
        closeElClasses: ["item", "caption", "zoom-wrap", "ui", "top-bar"],
        timeToIdle: 4000,
        timeToIdleOutside: 1000,
        loadingIndicatorDelay: 1000,
        addCaptionHTMLFn: function (item, captionEl) {
          if (!item.title) {
            captionEl.children[0].innerHTML = "";
            return false;
          }
          captionEl.children[0].innerHTML = item.title;
          return true;
        },
        closeEl: true,
        captionEl: true,
        fullscreenEl: true,
        zoomEl: true,
        shareEl: true,
        counterEl: true,
        arrowEl: true,
        preloaderEl: true,
        tapToClose: false,
        tapToToggleControls: true,
        clickToCloseNonZoomable: true,
        shareButtons: [
          {
            id: "facebook",
            label: "Share on Facebook",
            url: "https://www.facebook.com/sharer/sharer.php?u={{url}}",
          },
          {
            id: "twitter",
            label: "Tweet",
            url: "https://twitter.com/intent/tweet?text={{text}}&url={{url}}",
          },
          {
            id: "pinterest",
            label: "Pin it",
            url:
              "http://www.pinterest.com/pin/create/button/" +
              "?url={{url}}&media={{image_url}}&description={{text}}",
          },
          {
            id: "download",
            label: "Download image",
            url: "{{raw_image_url}}",
            download: true,
          },
        ],
        getImageURLForShare: function () {
          return pswp.currItem.src || "";
        },
        getPageURLForShare: function () {
          return window.location.href;
        },
        getTextForShare: function () {
          return pswp.currItem.title || "";
        },
        indexIndicatorSep: " / ",
        fitControlsWidth: 1200,
      },
      _blockControlsTap,
      _blockControlsTapTimeout;
    var _onControlsTap = function (e) {
        if (_blockControlsTap) {
          return true;
        }
        e = e || window.event;
        if (_options.timeToIdle && _options.mouseUsed && !_isIdle) {
          _onIdleMouseMove();
        }
        var target = e.target || e.srcElement,
          uiElement,
          clickedClass = target.getAttribute("class") || "",
          found;
        for (var i = 0; i < _uiElements.length; i++) {
          uiElement = _uiElements[i];
          if (
            uiElement.onTap &&
            clickedClass.indexOf("pswp__" + uiElement.name) > -1
          ) {
            uiElement.onTap();
            found = true;
          }
        }
        if (found) {
          if (e.stopPropagation) {
            e.stopPropagation();
          }
          _blockControlsTap = true;
          var tapDelay = framework.features.isOldAndroid ? 600 : 30;
          _blockControlsTapTimeout = setTimeout(function () {
            _blockControlsTap = false;
          }, tapDelay);
        }
      },
      _fitControlsInViewport = function () {
        return (
          !pswp.likelyTouchDevice ||
          _options.mouseUsed ||
          screen.width > _options.fitControlsWidth
        );
      },
      _togglePswpClass = function (el, cName, add) {
        framework[(add ? "add" : "remove") + "Class"](el, "pswp__" + cName);
      },
      _countNumItems = function () {
        var hasOneSlide = _options.getNumItemsFn() === 1;
        if (hasOneSlide !== _galleryHasOneSlide) {
          _togglePswpClass(_controls, "ui--one-slide", hasOneSlide);
          _galleryHasOneSlide = hasOneSlide;
        }
      },
      _toggleShareModalClass = function () {
        _togglePswpClass(_shareModal, "share-modal--hidden", _shareModalHidden);
      },
      _toggleShareModal = function () {
        _shareModalHidden = !_shareModalHidden;
        if (!_shareModalHidden) {
          _toggleShareModalClass();
          setTimeout(function () {
            if (!_shareModalHidden) {
              framework.addClass(_shareModal, "pswp__share-modal--fade-in");
            }
          }, 30);
        } else {
          framework.removeClass(_shareModal, "pswp__share-modal--fade-in");
          setTimeout(function () {
            if (_shareModalHidden) {
              _toggleShareModalClass();
            }
          }, 300);
        }
        if (!_shareModalHidden) {
          _updateShareURLs();
        }
        return false;
      },
      _openWindowPopup = function (e) {
        e = e || window.event;
        var target = e.target || e.srcElement;
        pswp.shout("shareLinkClick", e, target);
        if (!target.href) {
          return false;
        }
        if (target.hasAttribute("download")) {
          return true;
        }
        window.open(
          target.href,
          "pswp_share",
          "scrollbars=yes,resizable=yes,toolbar=no," +
            "location=yes,width=550,height=420,top=100,left=" +
            (window.screen ? Math.round(screen.width / 2 - 275) : 100),
        );
        if (!_shareModalHidden) {
          _toggleShareModal();
        }
        return false;
      },
      _updateShareURLs = function () {
        var shareButtonOut = "",
          shareButtonData,
          shareURL,
          image_url,
          page_url,
          share_text;
        for (var i = 0; i < _options.shareButtons.length; i++) {
          shareButtonData = _options.shareButtons[i];
          image_url = _options.getImageURLForShare(shareButtonData);
          page_url = _options.getPageURLForShare(shareButtonData);
          share_text = _options.getTextForShare(shareButtonData);
          shareURL = shareButtonData.url
            .replace("{{url}}", encodeURIComponent(page_url))
            .replace("{{image_url}}", encodeURIComponent(image_url))
            .replace("{{raw_image_url}}", image_url)
            .replace("{{text}}", encodeURIComponent(share_text));
          shareButtonOut +=
            '<a href="' +
            shareURL +
            '" target="_blank" ' +
            'class="pswp__share--' +
            shareButtonData.id +
            '"' +
            (shareButtonData.download ? "download" : "") +
            ">" +
            shareButtonData.label +
            "</a>";
          if (_options.parseShareButtonOut) {
            shareButtonOut = _options.parseShareButtonOut(
              shareButtonData,
              shareButtonOut,
            );
          }
        }
        _shareModal.children[0].innerHTML = shareButtonOut;
        _shareModal.children[0].onclick = _openWindowPopup;
      },
      _hasCloseClass = function (target) {
        for (var i = 0; i < _options.closeElClasses.length; i++) {
          if (
            framework.hasClass(target, "pswp__" + _options.closeElClasses[i])
          ) {
            return true;
          }
        }
      },
      _idleInterval,
      _idleTimer,
      _idleIncrement = 0,
      _onIdleMouseMove = function () {
        clearTimeout(_idleTimer);
        _idleIncrement = 0;
        if (_isIdle) {
          ui.setIdle(false);
        }
      },
      _onMouseLeaveWindow = function (e) {
        e = e ? e : window.event;
        var from = e.relatedTarget || e.toElement;
        if (!from || from.nodeName === "HTML") {
          clearTimeout(_idleTimer);
          _idleTimer = setTimeout(function () {
            ui.setIdle(true);
          }, _options.timeToIdleOutside);
        }
      },
      _setupFullscreenAPI = function () {
        if (_options.fullscreenEl && !framework.features.isOldAndroid) {
          if (!_fullscrenAPI) {
            _fullscrenAPI = ui.getFullscreenAPI();
          }
          if (_fullscrenAPI) {
            framework.bind(document, _fullscrenAPI.eventK, ui.updateFullscreen);
            ui.updateFullscreen();
            framework.addClass(pswp.template, "pswp--supports-fs");
          } else {
            framework.removeClass(pswp.template, "pswp--supports-fs");
          }
        }
      },
      _setupLoadingIndicator = function () {
        if (_options.preloaderEl) {
          _toggleLoadingIndicator(true);
          _listen("beforeChange", function () {
            clearTimeout(_loadingIndicatorTimeout);
            _loadingIndicatorTimeout = setTimeout(function () {
              if (pswp.currItem && pswp.currItem.loading) {
                if (
                  !pswp.allowProgressiveImg() ||
                  (pswp.currItem.img && !pswp.currItem.img.naturalWidth)
                ) {
                  _toggleLoadingIndicator(false);
                }
              } else {
                _toggleLoadingIndicator(true);
              }
            }, _options.loadingIndicatorDelay);
          });
          _listen("imageLoadComplete", function (index, item) {
            if (pswp.currItem === item) {
              _toggleLoadingIndicator(true);
            }
          });
        }
      },
      _toggleLoadingIndicator = function (hide) {
        if (_loadingIndicatorHidden !== hide) {
          _togglePswpClass(_loadingIndicator, "preloader--active", !hide);
          _loadingIndicatorHidden = hide;
        }
      },
      _applyNavBarGaps = function (item) {
        var gap = item.vGap;
        if (_fitControlsInViewport()) {
          var bars = _options.barsSize;
          if (_options.captionEl && bars.bottom === "auto") {
            if (!_fakeCaptionContainer) {
              _fakeCaptionContainer = framework.createEl(
                "pswp__caption pswp__caption--fake",
              );
              _fakeCaptionContainer.appendChild(
                framework.createEl("pswp__caption__center"),
              );
              _controls.insertBefore(_fakeCaptionContainer, _captionContainer);
              framework.addClass(_controls, "pswp__ui--fit");
            }
            if (_options.addCaptionHTMLFn(item, _fakeCaptionContainer, true)) {
              var captionSize = _fakeCaptionContainer.clientHeight;
              gap.bottom = parseInt(captionSize, 10) || 44;
            } else {
              gap.bottom = bars.top;
            }
          } else {
            gap.bottom = bars.bottom === "auto" ? 0 : bars.bottom;
          }
          gap.top = bars.top;
        } else {
          gap.top = gap.bottom = 0;
        }
      },
      _setupIdle = function () {
        if (_options.timeToIdle) {
          _listen("mouseUsed", function () {
            framework.bind(document, "mousemove", _onIdleMouseMove);
            framework.bind(document, "mouseout", _onMouseLeaveWindow);
            _idleInterval = setInterval(function () {
              _idleIncrement++;
              if (_idleIncrement === 2) {
                ui.setIdle(true);
              }
            }, _options.timeToIdle / 2);
          });
        }
      },
      _setupHidingControlsDuringGestures = function () {
        _listen("onVerticalDrag", function (now) {
          if (_controlsVisible && now < 0.95) {
            ui.hideControls();
          } else if (!_controlsVisible && now >= 0.95) {
            ui.showControls();
          }
        });
        var pinchControlsHidden;
        _listen("onPinchClose", function (now) {
          if (_controlsVisible && now < 0.9) {
            ui.hideControls();
            pinchControlsHidden = true;
          } else if (pinchControlsHidden && !_controlsVisible && now > 0.9) {
            ui.showControls();
          }
        });
        _listen("zoomGestureEnded", function () {
          pinchControlsHidden = false;
          if (pinchControlsHidden && !_controlsVisible) {
            ui.showControls();
          }
        });
      };
    var _uiElements = [
      {
        name: "caption",
        option: "captionEl",
        onInit: function (el) {
          _captionContainer = el;
        },
      },
      {
        name: "share-modal",
        option: "shareEl",
        onInit: function (el) {
          _shareModal = el;
        },
        onTap: function () {
          _toggleShareModal();
        },
      },
      {
        name: "button--share",
        option: "shareEl",
        onInit: function (el) {
          _shareButton = el;
        },
        onTap: function () {
          _toggleShareModal();
        },
      },
      { name: "button--zoom", option: "zoomEl", onTap: pswp.toggleDesktopZoom },
      {
        name: "counter",
        option: "counterEl",
        onInit: function (el) {
          _indexIndicator = el;
        },
      },
      { name: "button--close", option: "closeEl", onTap: pswp.close },
      { name: "button--arrow--left", option: "arrowEl", onTap: pswp.prev },
      { name: "button--arrow--right", option: "arrowEl", onTap: pswp.next },
      {
        name: "button--fs",
        option: "fullscreenEl",
        onTap: function () {
          if (_fullscrenAPI.isFullscreen()) {
            _fullscrenAPI.exit();
          } else {
            _fullscrenAPI.enter();
          }
        },
      },
      {
        name: "preloader",
        option: "preloaderEl",
        onInit: function (el) {
          _loadingIndicator = el;
        },
      },
    ];
    var _setupUIElements = function () {
      var item, classAttr, uiElement;
      var loopThroughChildElements = function (sChildren) {
        if (!sChildren) {
          return;
        }
        var l = sChildren.length;
        for (var i = 0; i < l; i++) {
          item = sChildren[i];
          classAttr = item.className;
          for (var a = 0; a < _uiElements.length; a++) {
            uiElement = _uiElements[a];
            if (classAttr.indexOf("pswp__" + uiElement.name) > -1) {
              if (_options[uiElement.option]) {
                framework.removeClass(item, "pswp__element--disabled");
                if (uiElement.onInit) {
                  uiElement.onInit(item);
                }
              } else {
                framework.addClass(item, "pswp__element--disabled");
              }
            }
          }
        }
      };
      loopThroughChildElements(_controls.children);
      var topBar = framework.getChildByClass(_controls, "pswp__top-bar");
      if (topBar) {
        loopThroughChildElements(topBar.children);
      }
    };
    ui.init = function () {
      framework.extend(pswp.options, _defaultUIOptions, true);
      _options = pswp.options;
      _controls = framework.getChildByClass(pswp.scrollWrap, "pswp__ui");
      _listen = pswp.listen;
      _setupHidingControlsDuringGestures();
      _listen("beforeChange", ui.update);
      _listen("doubleTap", function (point) {
        var initialZoomLevel = pswp.currItem.initialZoomLevel;
        if (pswp.getZoomLevel() !== initialZoomLevel) {
          pswp.zoomTo(initialZoomLevel, point, 333);
        } else {
          pswp.zoomTo(
            _options.getDoubleTapZoom(false, pswp.currItem),
            point,
            333,
          );
        }
      });
      _listen("preventDragEvent", function (e, isDown, preventObj) {
        var t = e.target || e.srcElement;
        if (
          t &&
          t.getAttribute("class") &&
          e.type.indexOf("mouse") > -1 &&
          (t.getAttribute("class").indexOf("__caption") > 0 ||
            /(SMALL|STRONG|EM)/i.test(t.tagName))
        ) {
          preventObj.prevent = false;
        }
      });
      _listen("bindEvents", function () {
        framework.bind(_controls, "pswpTap click", _onControlsTap);
        framework.bind(pswp.scrollWrap, "pswpTap", ui.onGlobalTap);
        if (!pswp.likelyTouchDevice) {
          framework.bind(pswp.scrollWrap, "mouseover", ui.onMouseOver);
        }
      });
      _listen("unbindEvents", function () {
        if (!_shareModalHidden) {
          _toggleShareModal();
        }
        if (_idleInterval) {
          clearInterval(_idleInterval);
        }
        framework.unbind(document, "mouseout", _onMouseLeaveWindow);
        framework.unbind(document, "mousemove", _onIdleMouseMove);
        framework.unbind(_controls, "pswpTap click", _onControlsTap);
        framework.unbind(pswp.scrollWrap, "pswpTap", ui.onGlobalTap);
        framework.unbind(pswp.scrollWrap, "mouseover", ui.onMouseOver);
        if (_fullscrenAPI) {
          framework.unbind(document, _fullscrenAPI.eventK, ui.updateFullscreen);
          if (_fullscrenAPI.isFullscreen()) {
            _options.hideAnimationDuration = 0;
            _fullscrenAPI.exit();
          }
          _fullscrenAPI = null;
        }
      });
      _listen("destroy", function () {
        if (_options.captionEl) {
          if (_fakeCaptionContainer) {
            _controls.removeChild(_fakeCaptionContainer);
          }
          framework.removeClass(_captionContainer, "pswp__caption--empty");
        }
        if (_shareModal) {
          _shareModal.children[0].onclick = null;
        }
        framework.removeClass(_controls, "pswp__ui--over-close");
        framework.addClass(_controls, "pswp__ui--hidden");
        ui.setIdle(false);
      });
      if (!_options.showAnimationDuration) {
        framework.removeClass(_controls, "pswp__ui--hidden");
      }
      _listen("initialZoomIn", function () {
        if (_options.showAnimationDuration) {
          framework.removeClass(_controls, "pswp__ui--hidden");
        }
      });
      _listen("initialZoomOut", function () {
        framework.addClass(_controls, "pswp__ui--hidden");
      });
      _listen("parseVerticalMargin", _applyNavBarGaps);
      _setupUIElements();
      if (_options.shareEl && _shareButton && _shareModal) {
        _shareModalHidden = true;
      }
      _countNumItems();
      _setupIdle();
      _setupFullscreenAPI();
      _setupLoadingIndicator();
    };
    ui.setIdle = function (isIdle) {
      _isIdle = isIdle;
      _togglePswpClass(_controls, "ui--idle", isIdle);
    };
    ui.update = function () {
      if (_controlsVisible && pswp.currItem) {
        ui.updateIndexIndicator();
        if (_options.captionEl) {
          _options.addCaptionHTMLFn(pswp.currItem, _captionContainer);
          _togglePswpClass(
            _captionContainer,
            "caption--empty",
            !pswp.currItem.title,
          );
        }
        _overlayUIUpdated = true;
      } else {
        _overlayUIUpdated = false;
      }
      if (!_shareModalHidden) {
        _toggleShareModal();
      }
      _countNumItems();
    };
    ui.updateFullscreen = function (e) {
      if (e) {
        setTimeout(function () {
          pswp.setScrollOffset(0, framework.getScrollY());
        }, 50);
      }
      framework[(_fullscrenAPI.isFullscreen() ? "add" : "remove") + "Class"](
        pswp.template,
        "pswp--fs",
      );
    };
    ui.updateIndexIndicator = function () {
      if (_options.counterEl) {
        _indexIndicator.innerHTML =
          pswp.getCurrentIndex() +
          1 +
          _options.indexIndicatorSep +
          _options.getNumItemsFn();
      }
    };
    ui.onGlobalTap = function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      if (_blockControlsTap) {
        return;
      }
      if (e.detail && e.detail.pointerType === "mouse") {
        if (_hasCloseClass(target)) {
          pswp.close();
          return;
        }
        if (framework.hasClass(target, "pswp__img")) {
          if (
            pswp.getZoomLevel() === 1 &&
            pswp.getZoomLevel() <= pswp.currItem.fitRatio
          ) {
            if (_options.clickToCloseNonZoomable) {
              pswp.close();
            }
          } else {
            pswp.toggleDesktopZoom(e.detail.releasePoint);
          }
        }
      } else {
        if (_options.tapToToggleControls) {
          if (_controlsVisible) {
            ui.hideControls();
          } else {
            ui.showControls();
          }
        }
        if (
          _options.tapToClose &&
          (framework.hasClass(target, "pswp__img") || _hasCloseClass(target))
        ) {
          pswp.close();
          return;
        }
      }
    };
    ui.onMouseOver = function (e) {
      e = e || window.event;
      var target = e.target || e.srcElement;
      _togglePswpClass(_controls, "ui--over-close", _hasCloseClass(target));
    };
    ui.hideControls = function () {
      framework.addClass(_controls, "pswp__ui--hidden");
      _controlsVisible = false;
    };
    ui.showControls = function () {
      _controlsVisible = true;
      if (!_overlayUIUpdated) {
        ui.update();
      }
      framework.removeClass(_controls, "pswp__ui--hidden");
    };
    ui.supportsFullscreen = function () {
      var d = document;
      return !!(
        d.exitFullscreen ||
        d.mozCancelFullScreen ||
        d.webkitExitFullscreen ||
        d.msExitFullscreen
      );
    };
    ui.getFullscreenAPI = function () {
      var dE = document.documentElement,
        api,
        tF = "fullscreenchange";
      if (dE.requestFullscreen) {
        api = {
          enterK: "requestFullscreen",
          exitK: "exitFullscreen",
          elementK: "fullscreenElement",
          eventK: tF,
        };
      } else if (dE.mozRequestFullScreen) {
        api = {
          enterK: "mozRequestFullScreen",
          exitK: "mozCancelFullScreen",
          elementK: "mozFullScreenElement",
          eventK: "moz" + tF,
        };
      } else if (dE.webkitRequestFullscreen) {
        api = {
          enterK: "webkitRequestFullscreen",
          exitK: "webkitExitFullscreen",
          elementK: "webkitFullscreenElement",
          eventK: "webkit" + tF,
        };
      } else if (dE.msRequestFullscreen) {
        api = {
          enterK: "msRequestFullscreen",
          exitK: "msExitFullscreen",
          elementK: "msFullscreenElement",
          eventK: "MSFullscreenChange",
        };
      }
      if (api) {
        api.enter = function () {
          _initalCloseOnScrollValue = _options.closeOnScroll;
          _options.closeOnScroll = false;
          if (this.enterK === "webkitRequestFullscreen") {
            pswp.template[this.enterK](Element.ALLOW_KEYBOARD_INPUT);
          } else {
            return pswp.template[this.enterK]();
          }
        };
        api.exit = function () {
          _options.closeOnScroll = _initalCloseOnScrollValue;
          return document[this.exitK]();
        };
        api.isFullscreen = function () {
          return document[this.elementK];
        };
      }
      return api;
    };
  };
  return PhotoSwipeUI_Default;
});

/* /droggol_theme_common/static/src/js/mixins.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.mixins", function (require) {
  "use strict";
  var core = require("web.core");
  var wUtils = require("website.utils");
  var DroggolNotification = require("droggol_theme_common.notification");
  var ConfirmationDialog = require("theme_prime.cart_confirmation_dialog");
  var _t = core._t;
  var qweb = core.qweb;
  var DroggolUtils = {
    _getDomainWithWebsite: function (domain) {
      return domain.concat(wUtils.websiteDomain(this));
    },
  };
  var OwlMixin = {
    _initalizeOwlSlider: function (ppr) {
      var responsive = {
        0: { items: 1 },
        576: { items: 2 },
        768: { items: 3 },
        992: { items: 3 },
        1200: { items: ppr },
      };
      if (this.$(".s_d_horizontal_card").length) {
        responsive = { 0: { items: 1 }, 576: { items: ppr } };
      }
      this.$(".droggol_product_slider").owlCarousel({
        dots: false,
        margin: 20,
        stagePadding: 5,
        rewind: true,
        rtl: _t.database.parameters.direction === "rtl",
        nav: true,
        navText: [
          '<i class="lnr lnr-arrow-left"></i>',
          '<i class="lnr lnr-arrow-right"></i>',
        ],
        responsive: responsive,
      });
    },
  };
  var CategoryMixins = {
    _getParsedSortBy: function (val) {
      var order = {
        price_asc: "list_price asc",
        price_desc: "list_price desc",
        name_asc: "name asc",
        name_desc: "name desc",
        newest_to_oldest: "create_date desc",
      };
      return order[val];
    },
    _fetchProductsByCategory: function (
      categoryID,
      includesChild,
      order,
      limit,
      fields,
    ) {
      var operator = "=";
      if (includesChild) {
        operator = "child_of";
      }
      return this._rpc({
        route: "/droggol_theme_common/get_products_by_category",
        params: {
          domain: [["public_categ_ids", operator, categoryID]],
          fields: fields,
          options: { order: order, limit: limit },
        },
      });
    },
  };
  var CategoryPublicWidgetMixins = {
    _getOptions: function () {
      var options = this._super.apply(this, arguments) || {};
      if (!this.initialCategory) {
        return false;
      }
      var categoryIDs = this.categoryParams.categoryIDs;
      options["order"] = this._getParsedSortBy(this.categoryParams.sortBy);
      options["limit"] = this.categoryParams.limit;
      options["get_categories"] = true;
      options["categoryIDs"] = categoryIDs;
      options["categoryID"] = this.initialCategory;
      return options;
    },
    _getDomain: function () {
      if (!this.initialCategory) {
        return false;
      }
      var operator = "=";
      if (this.categoryParams.includesChild) {
        operator = "child_of";
      }
      return [["public_categ_ids", operator, this.initialCategory]];
    },
  };
  var SortableMixins = {
    _makeListSortable: function () {
      this.$(".d_sortable_block").nestedSortable({
        listType: "ul",
        protectRoot: true,
        handle: ".d_sortable_item_handel",
        items: "li",
        toleranceElement: "> .row",
        forcePlaceholderSize: true,
        opacity: 0.6,
        tolerance: "pointer",
        placeholder: "d_drag_placeholder",
        maxLevels: 0,
        expression: "()(.+)",
      });
    },
  };
  var ProductCarouselMixins = {
    _updateIDs: function ($target) {
      var newID = _.uniqueId("d_carousel_");
      $target
        .find("#o-carousel-product")
        .addClass("d_shop_product_details_carousel");
      $target.find("#o-carousel-product").attr("id", newID);
      $target.find('[href="#o-carousel-product"]').attr("href", "#" + newID);
      $target
        .find('[data-target="#o-carousel-product"]')
        .attr("data-target", "#" + newID);
    },
  };
  var ProductsBlockMixins = {
    start: function () {
      var productParams = this.$target.attr("data-products-params");
      this.productParams = productParams ? JSON.parse(productParams) : false;
      this.selectionType = false;
      if (this.productParams) {
        this.selectionType = this.productParams.selectionType;
      }
      return this._super.apply(this, arguments);
    },
    _getDomain: function () {
      var domain = false;
      switch (this.selectionType) {
        case "manual":
          if (this.productParams.productIDs.length) {
            domain = [["id", "in", this.productParams.productIDs]];
          }
          break;
        case "advance":
          if (_.isArray(this.productParams.domain_params.domain)) {
            domain = this.productParams.domain_params.domain;
          }
          break;
      }
      return domain ? domain : this._super.apply(this, arguments);
    },
    _getLimit: function () {
      if (this.selectionType === "advance") {
        return this.productParams.domain_params.limit || 5;
      } else {
        return this._super.apply(this, arguments);
      }
    },
    _getSortBy: function () {
      if (this.selectionType === "advance") {
        return this.productParams.domain_params.sortBy;
      } else {
        return this._super.apply(this, arguments);
      }
    },
    _getProducts: function (data) {
      var products;
      var productParams = this.productParams;
      if (productParams) {
        switch (productParams.selectionType) {
          case "manual":
            products = _.map(
              this.productParams.productIDs,
              function (productID) {
                var product = _.findWhere(data.products, { id: productID });
                if (product) {
                  return product;
                }
              },
            );
            break;
          case "advance":
            products = data.products;
            break;
        }
      }
      return _.compact(products);
    },
    _processData: function (data) {
      this._super.apply(this, arguments);
      return this._getProducts(data);
    },
  };
  var CartManagerMixin = {
    _handleCartConfirmation: function (cart_flow, data) {
      var methodName = _.str.sprintf("_cart%s", _.str.classify(cart_flow));
      return this[methodName](data);
    },
    _cartNotification: function (data) {
      return this.displayNotification({
        Notification: DroggolNotification,
        sticky: true,
        type: "abcd",
        message: qweb.render("DroggolAddToCartNotification", {
          name: data.product_name,
        }),
        className: "d_notification d_notification_primary",
        d_icon: "lnr lnr-cart text-primary",
        d_image: _.str.sprintf(
          "/web/image/product.product/%s/image_256",
          this.rootProduct.product_id,
        ),
        buttons: [
          {
            text: _t("View cart"),
            class: "btn btn-link btn-sm p-0",
            link: true,
            href: "/shop/cart",
          },
        ],
      });
    },
    _cartDialog: function (data) {
      new ConfirmationDialog(this, { data: data, size: "medium" }).open();
    },
    _cartSideCart: function (data) {
      if (!$(".dr_sale_cart_sidebar_container.open").length) {
        if ($(".dr_sale_cart_sidebar:first").length) {
          $(".dr_sale_cart_sidebar:first").trigger("click");
          return;
        }
      }
      return this._cartNotification(data);
    },
  };
  return {
    DroggolUtils: DroggolUtils,
    OwlMixin: OwlMixin,
    CategoryMixins: CategoryMixins,
    CategoryPublicWidgetMixins: CategoryPublicWidgetMixins,
    SortableMixins: SortableMixins,
    ProductCarouselMixins: ProductCarouselMixins,
    ProductsBlockMixins: ProductsBlockMixins,
    CartManagerMixin: CartManagerMixin,
  };
});

/* /droggol_theme_common/static/src/js/snippet_frontend.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.snippet_frontend", function (require) {
  "use strict";
  require("web.dom_ready");
  var Widget = require("web.Widget");
  var PhotoSwipeLibraryWidget = Widget.extend({
    xmlDependencies: ["/droggol_theme_common/static/src/xml/photoswipe.xml"],
    template: "droggol_theme_common.PhotoSwipeContainer",
  });
  var photoSwipe = new PhotoSwipeLibraryWidget();
  photoSwipe.appendTo($("body"));
});

/* /droggol_theme_common/static/src/js/service_worker_register.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.service_worker_register", function (require) {
  "use strict";
  require("web.dom_ready");
  var Widget = require("web.Widget");
  var utils = require("web.utils");
  var html = document.documentElement;
  var websiteID = html.getAttribute("data-website-id") || 0;
  var PwaIosPopupWidget = Widget.extend({
    xmlDependencies: ["/droggol_theme_common/static/src/xml/pwa.xml"],
    template: "droggol_theme_common.pwa_ios_popup_template",
    events: { click: "_onClickPopup" },
    init: function () {
      this._super.apply(this, arguments);
      this.websiteID = websiteID;
    },
    _onClickPopup: function () {
      utils.set_cookie(_.str.sprintf("dr-pwa-popup-%s", websiteID), true);
      this.destroy();
    },
  });
  $.ajax("/pwa/is_pwa_active", { dataType: "json" }).done(function (json_data) {
    if (json_data.pwa) {
      activateServiceWorker();
    } else {
      deactivateServiceWorker();
    }
  });
  function displayPopupForiOS() {
    const isIos = () => {
      return (
        /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
        (navigator.userAgent.match(/iPad/i) ||
          navigator.userAgent.match(/iPhone/i))
      );
    };
    const isInStandaloneMode = () =>
      "standalone" in window.navigator && window.navigator.standalone;
    if (isIos() && !isInStandaloneMode()) {
      if (!utils.get_cookie(_.str.sprintf("dr-pwa-popup-%s", websiteID))) {
        var pwaIosPopupWidget = new PwaIosPopupWidget();
        pwaIosPopupWidget.appendTo($("body"));
      }
    }
  }
  function activateServiceWorker() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker
        .register("/service_worker.js")
        .then(function (registration) {
          displayPopupForiOS();
          console.log(
            "ServiceWorker registration successful with scope:",
            registration.scope,
          );
        })
        .catch(function (error) {
          console.log("ServiceWorker registration failed:", error);
        });
    }
  }
  function deactivateServiceWorker() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker
        .getRegistrations()
        .then(function (registrations) {
          _.each(registrations, function (r) {
            r.unregister();
            console.log("ServiceWorker removed successfully");
          });
        })
        .catch(function (err) {
          console.log("Service worker unregistration failed: ", err);
        });
    }
  }
});

/* /droggol_theme_common/static/src/js/snippet_root_widget.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.root.widget", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var qweb = core.qweb;
  var _t = core._t;
  return publicWidget.Widget.extend({
    disabledInEditableMode: false,
    xmlDependencies: [
      "/droggol_theme_common/static/src/xml/snippet_root_widget.xml",
    ],
    controllerRoute: false,
    fieldstoFetch: false,
    bodyTemplate: false,
    bodySelector: false,
    loaderTemplate: "droggol_default_loader",
    editorTemplate: false,
    displayLoader: true,
    drClearAttributes: [],
    noDataTemplate: "droggol_default_no_data_templ",
    noDataTemplateImg: "/droggol_theme_common/static/src/img/no_data.svg",
    noDataTemplateString: _t("¡No se encontraron documentos!"),
    noDataTemplateSubString: _t(
      "Lo sentimos, no pudimos encontrar ningún documento.",
    ),
    displayAllProductsBtn: true,
    start: function () {
      var defs = [this._super.apply(this, arguments)];
      var params = this._getParameters();
      if (!_.isEmpty(params)) {
        if (this.fieldstoFetch) {
          _.extend(params, { fields: this.fieldstoFetch });
        }
        defs.push(this._fetchData(params));
      } else {
        if (this.editableMode && this.editorTemplate) {
          this.$target.addClass("droggol_snippet");
          this._renderAndAppendQweb(
            this.editorTemplate,
            "d_editor_tmpl_default",
          );
        }
      }
      return Promise.all(defs);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      this._modifyElementsBeforeRemove();
      this._getBodySelectorElement().empty();
    },
    _appendLoader: function () {
      if (this.displayLoader && this.loaderTemplate) {
        this._renderAndAppendQweb(this.loaderTemplate, "d_loader_default");
      }
    },
    _appendNoDataTemplate: function () {
      if (this.noDataTemplate) {
        this._renderAndAppendQweb(
          this.noDataTemplate,
          "d_no_data_tmpl_default",
        );
      }
    },
    _cleanBeforeAppend: function () {
      this.$(".d_loader_default").remove();
      this.$(".d_no_data_tmpl_default").remove();
      this.$(".d_editor_tmpl_default").remove();
    },
    _cleanAttributes: function () {
      var self = this;
      if (
        _.has(odoo.session_info, "is_droggol_editor") &&
        !odoo.session_info.is_droggol_editor
      ) {
        _.each(this.drClearAttributes, function (attr) {
          self.$target.removeAttr(attr);
        });
      }
    },
    _getBodySelectorElement: function () {
      var selector = this.bodySelector;
      return selector ? this.$(selector) : this.$target;
    },
    _getDomain: function () {
      return false;
    },
    _getOptions: function () {
      return false;
    },
    _getLimit: function () {
      return false;
    },
    _getSortBy: function () {
      return false;
    },
    _getParameters: function () {
      var domain = this._getDomain();
      var params = {};
      if (domain) {
        params["domain"] = domain;
      }
      var limit = this._getLimit();
      if (limit) {
        params["limit"] = limit;
      }
      var order = this._getSortBy();
      if (order) {
        params["order"] = order;
      }
      var options = this._getOptions();
      if (options) {
        params["options"] = options;
      }
      return params;
    },
    _onSuccessResponse: function (response) {
      var hasData = this._responseHasData(response);
      if (hasData) {
        this._setDBData(response);
        var processedData = this._processData(response);
        this._renderContent(processedData);
      } else {
        this._appendNoDataTemplate();
      }
    },
    _fetchData: function (params) {
      this._appendLoader();
      return this._rpc({ route: this.controllerRoute, params: params }).then(
        (response) => {
          this._onSuccessResponse(response);
        },
      );
    },
    _modifyElementsBeforeRemove: function () {},
    _modifyElementsAfterAppend: function () {
      this.$(".d_body_tmpl_default").removeClass("d_body_tmpl_default");
      this._cleanAttributes();
    },
    _processData: function (data) {
      return data;
    },
    _responseHasData: function (data) {
      return data;
    },
    _setDBData: function (data) {},
    _renderAndAppendQweb: function (template, className, data) {
      if (!template) {
        return;
      }
      var $template = $(qweb.render(template, { data: data, widget: this }));
      $template.addClass(className);
      this._getBodySelectorElement().html($template);
    },
    _renderContent: function (data) {
      this._cleanBeforeAppend();
      this._renderAndAppendQweb(this.bodyTemplate, "d_body_tmpl_default", data);
      this._modifyElementsAfterAppend();
    },
  });
});

/* /droggol_theme_common/static/src/js/droggol_notification.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.notification", function (require) {
  "use strict";
  var Notification = require("web.Notification");
  return Notification.extend({
    template: "DroggolNotification",
    xmlDependencies: (Notification.prototype.xmlDependencies || []).concat([
      "/droggol_theme_common/static/src/xml/droggol_notification.xml",
    ]),
    init: function (parent, params) {
      this._super.apply(this, arguments);
      this.d_icon = params.d_icon;
      this.d_image = params.d_image;
    },
    start: function () {
      this.autohide = _.cancellableThrottleRemoveMeSoon(this.close, 5000, {
        leading: false,
      });
      this.$el.on("shown.bs.toast", () => {
        this.autohide();
      });
      return this._super.apply(this, arguments);
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/dialog_product_quick_view.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.product_quick_view", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var Dialog = require("web.Dialog");
  var publicWidget = require("web.public.widget");
  var Mixins = require("droggol_theme_common.mixins");
  var ProductCarouselMixins = Mixins.ProductCarouselMixins;
  require("website_sale_comparison.comparison");
  publicWidget.registry.ProductComparison.include({
    selector: ".oe_website_sale:not(.d_website_sale)",
  });
  return Dialog.extend(ProductCarouselMixins, {
    xmlDependencies: Dialog.prototype.xmlDependencies.concat([
      "/droggol_theme_common/static/src/xml/we_sale_snippets/dialog_product_quick_view.xml",
    ]),
    template: "droggol_theme_common.product_quick_view",
    events: _.extend({}, Dialog.prototype.events, { dr_close_dialog: "close" }),
    init: function (parent, options) {
      this.productID = options.productID;
      this.mini = options.mini || false;
      this.variantID = options.variantID || false;
      this.add_if_single_variant = options.add_if_single_variant || false;
      this.size = options.size || "extra-large";
      this._super(
        parent,
        _.extend(
          {
            renderHeader: false,
            renderFooter: false,
            technical: false,
            size: this.size,
            backdrop: true,
          },
          options || {},
        ),
      );
    },
    willStart: function () {
      var self = this;
      var allPromise = [this._super.apply(this, arguments)];
      this.contentPromise = ajax
        .jsonRpc("/droggol_theme_common/get_quick_view_html", "call", {
          options: {
            productID: this.productID,
            variantID: this.variantID,
            mini: this.mini,
            add_if_single_variant: this.add_if_single_variant,
          },
        })
        .then(function (content) {
          if (
            self.add_if_single_variant &&
            $(content).hasClass("auto-add-product")
          ) {
            self.preventOpening = true;
          }
          return content;
        });
      if (this.add_if_single_variant) {
        allPromise.push(this.contentPromise);
      }
      return Promise.all(allPromise);
    },
    start: function () {
      var sup = this._super.apply(this, arguments);
      $("<button/>", {
        class: "close",
        "data-dismiss": "modal",
        html: '<i class="lnr lnr-cross"/>',
      }).prependTo(this.$modal.find(".modal-content"));
      this.$modal
        .find(".modal-dialog")
        .addClass(
          "modal-dialog-centered d_product_quick_view_dialog dr_full_dialog",
        );
      if (this.mini) {
        this.$modal.find(".modal-dialog").addClass("is_mini");
      }
      this.contentPromise.then((data) => {
        this.$el.find(".d_product_quick_view_loader").replaceWith(data);
        this._updateIDs(this.$el);
        this.trigger_up("widgets_start_request", {
          $target: this.$(".oe_website_sale"),
        });
      });
      if (this.preventOpening) {
        return Promise.reject();
      }
      return sup;
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/product_root_widget.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.product.root.widget", function (require) {
  "use strict";
  var core = require("web.core");
  var DroggolRootWidget = require("droggol_theme_common.root.widget");
  var DroggolNotification = require("droggol_theme_common.notification");
  var QuickViewDialog = require("droggol_theme_common.product_quick_view");
  var wSaleUtils = require("website_sale.utils");
  var qweb = core.qweb;
  var _t = core._t;
  return DroggolRootWidget.extend({
    xmlDependencies: (DroggolRootWidget.prototype.xmlDependencies || []).concat(
      [
        "/droggol_theme_common/static/src/xml/we_sale_snippets/droggol_notification_template.xml",
      ],
    ),
    drClearAttributes: (
      DroggolRootWidget.prototype.drClearAttributes || []
    ).concat(["data-user-params"]),
    read_events: {
      "click .d_add_to_cart_btn": "_onAddToCartClick",
      "click .d_add_to_wishlist_btn": "_onAddtoWishlistClick",
      "click .d_product_quick_view": "_onProductQuickViewClick",
      "mouseenter .d_product_thumb_img": "_onMouseEnter",
    },
    start: function () {
      var userParams = this.$target.attr("data-user-params");
      this.userParams = userParams ? JSON.parse(userParams) : false;
      return this._super.apply(this, arguments);
    },
    _addProductToCart: function (cartInfo) {
      var isCustomFlow = _.contains(
        ["side_cart", "dialog", "notification"],
        odoo.session_info.dr_cart_flow || "default",
      );
      var dialogOptions = {
        mini: true,
        size: "small",
        add_if_single_variant: isCustomFlow,
      };
      dialogOptions["variantID"] = cartInfo.productID;
      this.QuickViewDialog = new QuickViewDialog(this, dialogOptions).open();
      return this.QuickViewDialog;
    },
    _getCartParams: function (ev) {
      return {
        productID: parseInt(
          $(ev.currentTarget).attr("data-product-product-id"),
        ),
        qty: 1,
      };
    },
    _getOptions: function () {
      var options = {};
      if (this.userParams) {
        if (this.userParams.wishlist) {
          options["wishlist_enabled"] = true;
        }
        if (this._anyActionEnabled(this._getMustDisabledOptions())) {
          options["shop_config_params"] = true;
        }
        return options;
      } else {
        return this._super.apply(this, arguments);
      }
    },
    _anyActionEnabled: function (options) {
      return _.contains(_.values(_.pick(this.userParams, options)), true);
    },
    _getAllActions: function () {
      return ["wishlist", "comparison", "add_to_cart", "quick_view"];
    },
    _getMustDisabledOptions: function () {
      return ["wishlist", "comparison", "rating"];
    },
    _initTips: function () {
      this.$('[data-toggle="tooltip"]').tooltip();
    },
    _modifyElementsAfterAppend: function () {
      var self = this;
      this._initTips();
      _.each(this.wishlistProductIDs, function (id) {
        self
          .$('.d_add_to_wishlist_btn[data-product-product-id="' + id + '"]')
          .prop("disabled", true)
          .addClass("disabled");
      });
      this._super.apply(this, arguments);
    },
    _updateUserParams: function (shopConfigParams) {
      var self = this;
      if (this.userParams) {
        _.each(this._getMustDisabledOptions(), function (option) {
          var enabledInShop = shopConfigParams["is_" + option + "_active"];
          if (!enabledInShop) {
            self.userParams[option] = false;
          }
        });
        this.userParams["anyActionEnabled"] = this._anyActionEnabled(
          this._getAllActions(),
        );
      }
    },
    _updateWishlistView: function () {
      if (this.wishlistProductIDs.length > 0) {
        $(".o_wsale_my_wish").show();
        $(".my_wish_quantity").text(this.wishlistProductIDs.length);
      } else {
        $(".o_wsale_my_wish").show();
        $(".my_wish_quantity").text("");
      }
    },
    _setDBData: function (data) {
      if (data.wishlist_products) {
        this.wishlistProductIDs = data.wishlist_products;
      }
      if (data.shop_config_params) {
        this._updateUserParams(data.shop_config_params);
      }
      this._super.apply(this, arguments);
    },
    _onAddToCartClick: function (ev) {
      this._addProductToCart(this._getCartParams(ev));
    },
    _onProductQuickViewClick: function (ev) {
      this.QuickViewDialog = new QuickViewDialog(this, {
        productID: parseInt(
          $(ev.currentTarget).attr("data-product-template-id"),
        ),
      });
      this.QuickViewDialog.open();
    },
    _removeProductFromWishlist: function (wishlistID, productID) {
      var self = this;
      this._rpc({ route: "/shop/wishlist/remove/" + wishlistID }).then(
        function () {
          $(
            ".d_add_to_wishlist_btn[data-product-product-id='" +
              productID +
              "']",
          )
            .prop("disabled", false)
            .removeClass("disabled");
          self.wishlistProductIDs = _.filter(
            self.wishlistProductIDs,
            function (id) {
              return id !== productID;
            },
          );
          self._updateWishlistView();
        },
      );
    },
    _onAddtoWishlistClick: function (ev) {
      var productID = parseInt(
        $(ev.currentTarget).attr("data-product-product-id"),
      );
      this._rpc({
        route: "/droggol_theme_common/wishlist_general",
        params: { product_id: productID },
      }).then((res) => {
        this.wishlistProductIDs = res.products;
        this.displayNotification({
          Notification: DroggolNotification,
          sticky: false,
          type: "abcd",
          message: qweb.render("DroggolWishlistNotification", {
            name: res.name,
          }),
          className: "d_notification d_notification_danger",
          d_image: _.str.sprintf(
            "/web/image/product.product/%s/image_256",
            productID,
          ),
          buttons: [
            {
              text: _t("See your wishlist"),
              class: "btn btn-link btn-sm p-0",
              link: true,
              href: "/shop/wishlist",
            },
            {
              text: _t("Undo"),
              class: "btn btn-link btn-sm float-right",
              click: this._removeProductFromWishlist.bind(
                this,
                res.wishlist_id,
                productID,
              ),
            },
          ],
        });
        this._updateWishlistView();
        $(".d_add_to_wishlist_btn[data-product-product-id='" + productID + "']")
          .prop("disabled", true)
          .addClass("disabled");
      });
    },
    _onMouseEnter: function (ev) {
      var $target = $(ev.currentTarget);
      var src = $target.attr("src");
      var productID = $target.attr("data-product-id");
      var $card = this.$(".d_product_card[data-product-id=" + productID + "]");
      $card.find(".d-product-img").attr("src", src);
      $card.find(".d_product_thumb_img").removeClass("d_active");
      $target.addClass("d_active");
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/quick_view_product.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.quick_view_product_btn", function (require) {
  "use strict";
  var QuickViewDialog = require("droggol_theme_common.product_quick_view");
  var publicWidget = require("web.public.widget");
  publicWidget.registry.d_product_quick_view = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    read_events: {
      "click .d_product_quick_view_btn": "_onProductQuickViewClick",
    },
    _onProductQuickViewClick: function (ev) {
      this.QuickViewDialog = new QuickViewDialog(this, {
        productID: parseInt($(ev.currentTarget).attr("data-product-id")),
      });
      this.QuickViewDialog.open();
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/product_comparison.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.product_comparison", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  require("website_sale_comparison.comparison");
  publicWidget.registry.ProductComparison.include({
    selector: "#wrap",
    read_events: _.extend(
      { "click .d_product_comparison": "_onClickCompareBtn" },
      publicWidget.registry.ProductComparison.prototype.read_events,
    ),
    start: function () {
      var defs = [];
      if (
        this.$(".droggol_product_snippet[data-user-params]").length ||
        this.$(".oe_website_sale").length
      ) {
        defs.push(this._super.apply(this, arguments));
      }
      return Promise.all(defs);
    },
    _onClickCompareBtn: function (ev) {
      var productId = $(ev.currentTarget).data("product-product-id");
      var comparison = this.productComparison;
      if (
        comparison.comparelist_product_ids.length <
        this.productComparison.product_compare_limit
      ) {
        comparison._addNewProducts(productId);
      } else {
        comparison.$el.find(".o_comparelist_limit_warning").show();
        $("#comparelist .o_product_panel_header").popover("show");
      }
    },
  });
});

/* /droggol_theme_common/static/src/js/dialogs/product_configurator_modal.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define(
  "droggol_theme_common.product_configurator_modal",
  function (require) {
    "use strict";
    var OptionalProductsModal = require("sale_product_configurator.OptionalProductsModal");
    OptionalProductsModal.include({
      init: function (parent, params) {
        this._super(parent, params);
        this.container = $(parent).hasClass("d_cart_update_form")
          ? $("body")[0]
          : parent;
      },
    });
  },
);

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_droggol_product_snippet.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.droggol_product_snippet", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var ProductRootWidget = require("droggol_theme_common.product.root.widget");
  var Mixins = require("droggol_theme_common.mixins");
  var config = require("web.config");
  var OwlMixin = Mixins.OwlMixin;
  var ProductsBlockMixins = Mixins.ProductsBlockMixins;
  var core = require("web.core");
  var _t = core._t;
  publicWidget.registry.s_d_products_snippet = ProductRootWidget.extend(
    OwlMixin,
    ProductsBlockMixins,
    {
      selector: ".s_d_products_snippet_wrapper",
      bodyTemplate: "d_s_cards_wrapper",
      bodySelector: ".s_d_products_snippet",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-products-params"]),
      controllerRoute: "/droggol_theme_common/get_products_data",
      fieldstoFetch: [
        "name",
        "price",
        "description_sale",
        "dr_label_id",
        "rating",
        "public_categ_ids",
        "product_template_image_ids",
      ],
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat(["/droggol_theme_common/static/src/xml/cards.xml"]),
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        if (this.userParams.layoutType === "slider") {
          this._initalizeOwlSlider(this.userParams.ppr);
        }
      },
    },
  );
  publicWidget.registry.s_d_product_count_down = ProductRootWidget.extend(
    ProductsBlockMixins,
    {
      selector: ".s_d_product_count_down",
      bodyTemplate: "s_d_product_count_down_template",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-products-params"]),
      controllerRoute: "/droggol_theme_common/get_products_data",
      fieldstoFetch: [
        "name",
        "price",
        "description_sale",
        "rating",
        "public_categ_ids",
        "offer_data",
        "dr_label_id",
      ],
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_d_product_count_down.xml",
      ]),
      _getOptions: function () {
        var options = this._super.apply(this, arguments);
        if (this.selectionType) {
          options = options || {};
          options["shop_config_params"] = true;
        }
        return options;
      },
      _setDBData: function (data) {
        this.shopParams = data.shop_config_params;
        this._super.apply(this, arguments);
      },
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        this.trigger_up("widgets_start_request", {
          editableMode: this.editableMode,
          $target: this.$(".s_countdown"),
        });
        this.$(".droggol_product_slider_top").owlCarousel({
          dots: false,
          margin: 20,
          stagePadding: 5,
          rewind: true,
          rtl: _t.database.parameters.direction === "rtl",
          nav: true,
          navText: [
            '<i class="lnr h4 lnr-chevron-left"></i>',
            '<i class="lnr h4 lnr-chevron-right"></i>',
          ],
          responsive: {
            0: { items: 1 },
            768: { items: 2 },
            992: { items: 1 },
            1200: { items: 1 },
          },
        });
      },
    },
  );
  publicWidget.registry.s_d_product_small_block = ProductRootWidget.extend(
    ProductsBlockMixins,
    {
      selector: ".s_d_product_small_block",
      bodyTemplate: "s_d_product_small_block_template",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-products-params"]),
      controllerRoute: "/droggol_theme_common/get_products_data",
      fieldstoFetch: [
        "name",
        "price",
        "rating",
        "public_categ_ids",
        "dr_label_id",
      ],
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_d_product_count_down.xml",
      ]),
      _modifyElementsAfterAppend: function () {
        var self = this;
        this._super.apply(this, arguments);
        var numOfCol = this.$el.hasClass("in_confirm_dialog") ? 4 : 3;
        this.$(".droggol_product_slider_top").owlCarousel({
          dots: false,
          margin: 20,
          stagePadding: 5,
          rewind: true,
          nav: true,
          rtl: _t.database.parameters.direction === "rtl",
          navText: [
            '<i class="lnr h4 lnr-chevron-left"></i>',
            '<i class="lnr h4 lnr-chevron-right"></i>',
          ],
          onInitialized: function () {
            var $img = self.$(".d-product-img:first");
            if (self.$(".d-product-img:first").length) {
              $img.one("load", function () {
                setTimeout(function () {
                  if (!config.device.isMobile) {
                    var height = self.$target
                      .parents(".s_d_2_column_snippet")
                      .find(".s_d_product_count_down .owl-item.active")
                      .height();
                    self.$(".owl-item").height(height);
                  }
                }, 300);
              });
            }
          },
          responsive: {
            0: { items: 2 },
            576: { items: 2 },
            768: { items: 2 },
            992: { items: 2 },
            1200: { items: numOfCol },
          },
        });
      },
    },
  );
  publicWidget.registry.s_d_single_product_count_down =
    ProductRootWidget.extend(ProductsBlockMixins, {
      selector: ".s_d_single_product_count_down",
      bodyTemplate: "s_d_single_product_count_down_temp",
      controllerRoute: "/droggol_theme_common/get_products_data",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-products-params"]),
      fieldstoFetch: ["name", "price", "offer_data", "description_sale"],
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_d_product_count_down.xml",
      ]),
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        this.trigger_up("widgets_start_request", {
          editableMode: this.editableMode,
          $target: this.$(".s_countdown"),
        });
        this.$(".droggol_product_slider_single_product").owlCarousel({
          dots: false,
          margin: 20,
          rtl: _t.database.parameters.direction === "rtl",
          stagePadding: 5,
          rewind: true,
          nav: true,
          navText: [
            '<i class="lnr lnr-arrow-left"></i>',
            '<i class="lnr lnr-arrow-right"></i>',
          ],
          responsive: { 0: { items: 1 } },
        });
      },
    });
  publicWidget.registry.s_d_image_products_block = ProductRootWidget.extend(
    ProductsBlockMixins,
    {
      selector: ".s_d_image_products_block_wrapper",
      bodyTemplate: "s_d_image_products_block_tmpl",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-products-params"]),
      bodySelector: ".s_d_image_products_block",
      controllerRoute: "/droggol_theme_common/get_products_data",
      fieldstoFetch: [
        "name",
        "price",
        "rating",
        "public_categ_ids",
        "dr_label_id",
      ],
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_image_products.xml",
      ]),
      _processData: function (data) {
        var products = this._getProducts(data);
        var items = 6;
        if (config.device.isMobile) {
          items = 4;
        }
        var group = _.groupBy(products, function (product, index) {
          return Math.floor(index / items);
        });
        return _.toArray(group);
      },
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        this.$(".droggol_product_slider_top").owlCarousel({
          dots: false,
          margin: 10,
          stagePadding: 5,
          rewind: true,
          nav: true,
          rtl: _t.database.parameters.direction === "rtl",
          navText: [
            '<i class="lnr h4 lnr-chevron-left"></i>',
            '<i class="lnr h4 lnr-chevron-right"></i>',
          ],
          responsive: {
            0: { items: 1 },
            576: { items: 1 },
            768: { items: 1 },
            992: { items: 1 },
            1200: { items: 1 },
          },
        });
      },
    },
  );
});

/* /droggol_theme_common/static/src/js/s_countdown_frontend.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_countdown_frontend", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var time = require("web.time");
  publicWidget.registry.s_countdown = publicWidget.Widget.extend({
    selector: ".s_countdown",
    disabledInEditableMode: false,
    start: function () {
      var self = this;
      var def = this._super.apply(this, arguments);
      var eventTime = moment(
        time.str_to_datetime(this.$el.attr("data-due-date")),
      );
      var currentTime = moment();
      var diffTime = eventTime - currentTime;
      var duration = moment.duration(diffTime);
      var interval = 1000;
      this.$el
        .find(".end_msg_container")
        .addClass("css_non_editable_mode_hidden");
      if (diffTime > 0) {
        this.countDownTimer = setInterval(function () {
          duration = moment.duration(
            duration.asMilliseconds() - interval,
            "milliseconds",
          );
          if (duration.asMilliseconds() < 0) {
            self._endCountdown();
          }
          var d = parseInt(moment.duration(duration).asDays());
          var h = moment.duration(duration).hours();
          var m = moment.duration(duration).minutes();
          var s = moment.duration(duration).seconds();
          d = $.trim(d).length === 1 ? "0" + d : d;
          h = $.trim(h).length === 1 ? "0" + h : h;
          m = $.trim(m).length === 1 ? "0" + m : m;
          s = $.trim(s).length === 1 ? "0" + s : s;
          self.$(".countdown_days").text(d);
          self.$(".countdown_hours").text(h);
          self.$(".countdown_minutes").text(m);
          self.$(".countdown_seconds").text(s);
        }, interval);
      } else {
        this._endCountdown();
      }
      return def;
    },
    _endCountdown: function () {
      if (this.$target.parents(".s_coming_soon").length) {
        if (!this.editableMode) {
          this.$target.parents(".s_coming_soon").addClass("d-none");
          this.$target.addClass("d_count_down_over");
        }
        $("body").css("overflow", "auto");
      }
      this.$(".countdown_days").text("00");
      this.$(".countdown_hours").text("00");
      this.$(".countdown_minutes").text("00");
      this.$(".countdown_seconds").text("00");
      this.$el
        .find(".end_msg_container")
        .removeClass("css_non_editable_mode_hidden");
      if (this.countDownTimer) {
        clearInterval(this.countDownTimer);
      }
    },
    destroy: function () {
      if (this.countDownTimer) {
        clearInterval(this.countDownTimer);
      }
      this._super.apply(this, arguments);
    },
  });
});

/* /droggol_theme_common/static/src/js/s_gallery_frontend.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_gallery_frontend", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  publicWidget.registry.s_gallery = publicWidget.Widget.extend({
    selector: ".s_gallery",
    read_events: { "click .gallery-image": "_onClickGalleryImage" },
    start: function () {
      this.items = _.map(this.$(".gallery-image"), function (item) {
        var $img = $(item).find(".img-fluid");
        if ($img.length) {
          return {
            src: $img.attr("src"),
            w: $img[0].naturalWidth,
            h: $img[0].naturalHeight,
            title: $img.attr("alt") || $img.attr("title"),
          };
        } else {
          return {
            src: "/web/static/src/img/mimetypes/video.svg",
            w: 300,
            h: 300,
            title: _t("Video"),
          };
        }
      });
      return this._super.apply(this, arguments);
    },
    _onClickGalleryImage: function (ev) {
      var photoSwipe = new PhotoSwipe(
        $(".pswp")[0],
        PhotoSwipeUI_Default,
        this.items,
        {
          shareButtons: [
            {
              id: "download",
              label: _t("Download image"),
              url: "{{raw_image_url}}",
              download: true,
            },
          ],
          index: $(ev.currentTarget).parent().index(),
          closeOnScroll: false,
          bgOpacity: 0.8,
          tapToToggleControls: false,
          clickToCloseNonZoomable: false,
        },
      );
      photoSwipe.init();
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_category_snippet.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_category_snippet", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var ProductRootWidget = require("droggol_theme_common.product.root.widget");
  var core = require("web.core");
  var Mixins = require("droggol_theme_common.mixins");
  var OwlMixin = Mixins.OwlMixin;
  var CategoryMixins = Mixins.CategoryMixins;
  var CategoryPublicWidgetMixins = Mixins.CategoryPublicWidgetMixins;
  var qweb = core.qweb;
  var _t = core._t;
  publicWidget.registry.s_category_snippet = ProductRootWidget.extend(
    OwlMixin,
    CategoryMixins,
    CategoryPublicWidgetMixins,
    {
      selector: ".s_d_category_snippet_wrapper",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-category-params", "data-category-filter"]),
      bodyTemplate: "d_s_category_cards_wrapper",
      bodySelector: ".s_d_category_snippet",
      controllerRoute: "/droggol_theme_common/get_products_by_category",
      fieldstoFetch: [
        "name",
        "price",
        "description_sale",
        "dr_label_id",
        "rating",
        "public_categ_ids",
        "product_template_image_ids",
      ],
      noDataTemplateSubString: _t(
        "Lo sentimos, no pudimos encontrar ningún documento en esta categoría",
      ),
      read_events: _.extend(
        { "click .d_category_lable": "_onCategoryLableClick" },
        ProductRootWidget.prototype.read_events,
      ),
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/cards.xml",
        "/droggol_theme_common/static/src/xml/category_filters.xml",
      ]),
      start: function () {
        var categoryParams = this.$target.attr("data-category-params");
        var categoryFilterStyle = this.$target.attr("data-category-filter");
        this.categoryParams = categoryParams
          ? JSON.parse(categoryParams)
          : false;
        this.categoryFilterStyle = categoryFilterStyle
          ? JSON.parse(categoryFilterStyle)
          : false;
        this.initialCategory = false;
        if (this.categoryParams) {
          var categoryIDs = this.categoryParams.categoryIDs;
          this.initialCategory = categoryIDs.length ? categoryIDs[0] : false;
        }
        return this._super.apply(this, arguments);
      },
      _activateCategory: function (categoryID) {
        this.$(".d_s_category_cards_item").addClass("d-none");
        this.$(
          ".d_s_category_cards_item[data-category-id=" + categoryID + "]",
        ).removeClass("d-none");
      },
      _fetchAndAppendByCategory: function (categoryID) {
        this._activateCategory(categoryID);
        this._fetchProductsByCategory(
          categoryID,
          this.categoryParams.includesChild,
          this._getParsedSortBy(this.categoryParams.sortBy),
          this.categoryParams.limit,
          this.fieldstoFetch,
        ).then((data) => {
          this._renderNewProducts(data.products, categoryID);
        });
      },
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        var categories = this.fetchedCategories;
        if (categories.length && categories[0] !== this.initialCategory) {
          this._fetchAndAppendByCategory(categories[0]);
        }
        if (this.userParams.layoutType === "slider") {
          this._initalizeOwlSlider(this.userParams.ppr);
        }
      },
      _processData: function (data) {
        var categories = this.fetchedCategories;
        if (!categories.length) {
          this._appendNoDataTemplate();
          return [];
        }
        if (categories.length && categories[0] !== this.initialCategory) {
          return [];
        } else {
          return data.products;
        }
      },
      _renderNewProducts: function (products, categoryID) {
        var $tmpl = $(
          qweb.render("d_s_category_cards_item", {
            data: products,
            widget: this,
            categoryID: categoryID,
          }),
        );
        this.$(".d_loader_default").remove();
        $tmpl.appendTo(this.$(".d_s_category_cards_container"));
        this._initalizeOwlSlider(this.userParams.ppr);
      },
      _setDBData: function (data) {
        var categories = _.map(
          this.categoryParams.categoryIDs,
          function (categoryID) {
            return _.findWhere(data.categories, { id: categoryID });
          },
        );
        this.categories = _.compact(categories);
        this.fetchedCategories = _.map(this.categories, function (category) {
          return category.id;
        });
        this.categoryParams.categoryIDs = this.fetchedCategories;
        this._super.apply(this, arguments);
      },
      _onCategoryLableClick: function (ev) {
        var $target = $(ev.currentTarget);
        this.$(".d_category_lable").removeClass("d_active");
        $target.addClass("d_active");
        var categoryID = parseInt($target.attr("data-category-id"), 10);
        if (
          !this.$(
            ".d_s_category_cards_item[data-category-id=" + categoryID + "]",
          ).length
        ) {
          if (this.loaderTemplate) {
            var $template = $(qweb.render(this.loaderTemplate));
            $template.addClass("d_loader_default");
            $template.appendTo(this.$(".d_s_category_cards_container"));
          }
          this._fetchAndAppendByCategory(categoryID);
        } else {
          this._activateCategory(categoryID);
        }
      },
    },
  );
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_single_category_snippet.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define(
  "droggol_theme_common.s_single_category_snippet",
  function (require) {
    "use strict";
    var publicWidget = require("web.public.widget");
    var ProductRootWidget = require("droggol_theme_common.product.root.widget");
    var Mixins = require("droggol_theme_common.mixins");
    var CategoryMixins = Mixins.CategoryMixins;
    var CategoryPublicWidgetMixins = Mixins.CategoryPublicWidgetMixins;
    var core = require("web.core");
    var config = require("web.config");
    var _t = core._t;
    publicWidget.registry.s_single_category_snippet = ProductRootWidget.extend(
      CategoryMixins,
      CategoryPublicWidgetMixins,
      {
        selector: ".s_d_single_category_snippet_wrapper",
        bodyTemplate: "s_single_category_snippet",
        bodySelector: ".s_d_single_category_snippet",
        drClearAttributes: (
          ProductRootWidget.prototype.drClearAttributes || []
        ).concat(["data-category-params"]),
        controllerRoute: "/droggol_theme_common/get_products_by_category",
        fieldstoFetch: [
          "name",
          "price",
          "description_sale",
          "dr_label_id",
          "rating",
          "public_categ_ids",
        ],
        xmlDependencies: (
          ProductRootWidget.prototype.xmlDependencies || []
        ).concat([
          "/droggol_theme_common/static/src/xml/we_sale_snippets/s_single_category_snippet.xml",
        ]),
        start: function () {
          var categoryParams = this.$target.attr("data-category-params");
          this.categoryParams = categoryParams
            ? JSON.parse(categoryParams)
            : false;
          this.initialCategory = false;
          if (this.categoryParams) {
            var categoryIDs = this.categoryParams.categoryIDs;
            this.initialCategory = categoryIDs.length ? categoryIDs[0] : false;
          }
          return this._super.apply(this, arguments);
        },
        _setDBData: function (data) {
          var categories = data.categories;
          if (categories && categories.length) {
            this.categoryName = categories.length ? categories[0].name : false;
          }
          this._super.apply(this, arguments);
        },
        _modifyElementsAfterAppend: function () {
          this._super.apply(this, arguments);
          this._initalizeOwlSlider(this.userParams.ppr);
        },
        _processData: function (data) {
          if (this.categoryName) {
            var items = 8;
            if (config.device.isMobile) {
              items = 4;
            }
            var group = _.groupBy(data.products, function (product, index) {
              return Math.floor(index / items);
            });
            return _.toArray(group);
          } else {
            return [];
          }
        },
        _initalizeOwlSlider: function () {
          this.$(".droggol_product_category_slider").owlCarousel({
            dots: false,
            margin: 10,
            stagePadding: 5,
            rtl: _t.database.parameters.direction === "rtl",
            rewind: true,
            nav: true,
            navText: [
              '<div class="badge text-primary"><i class="lnr font-weight-bold lnr-chevron-left"></i></div>',
              '<div class="badge text-primary"><i class="lnr font-weight-bold lnr-chevron-right"></i></div>',
            ],
            responsive: {
              0: { items: 1 },
              576: { items: 1 },
              768: { items: 1 },
              992: { items: 1 },
              1200: { items: 1 },
            },
          });
        },
      },
    );
  },
);

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_single_product_snippet.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define(
  "droggol_theme_common.s_single_product_snippet",
  function (require) {
    "use strict";
    var publicWidget = require("web.public.widget");
    var RootWidget = require("droggol_theme_common.root.widget");
    var Mixins = require("droggol_theme_common.mixins");
    var core = require("web.core");
    var qweb = core.qweb;
    var _t = core._t;
    var ProductCarouselMixins = Mixins.ProductCarouselMixins;
    publicWidget.registry.s_d_single_product_cover_snippet = RootWidget.extend(
      ProductCarouselMixins,
      {
        selector: ".s_d_single_product_cover_snippet_wrapper",
        bodyTemplate: "s_d_single_product_cover_snippet",
        bodySelector: ".s_d_single_product_cover_snippet",
        controllerRoute: "/droggol_theme_common/get_single_product_data",
        noDataTemplateString: _t("No product found"),
        noDataTemplateSubString: _t(
          "Sorry, this product is not available right now",
        ),
        displayAllProductsBtn: false,
        drClearAttributes: (
          RootWidget.prototype.drClearAttributes || []
        ).concat(["data-products-params"]),
        xmlDependencies: (RootWidget.prototype.xmlDependencies || []).concat([
          "/droggol_theme_common/static/src/xml/we_sale_snippets/s_single_product_snippet.xml",
        ]),
        start: function () {
          var productParams = this.$target.attr("data-products-params");
          this.productParams = productParams
            ? JSON.parse(productParams)
            : false;
          this.initialProduct = false;
          this.productIDs = false;
          if (this.productParams) {
            var productIDs = this.productParams.productIDs;
            if (productIDs.length) {
              this.initialProduct = productIDs[0];
              this.productIDs = productIDs;
            }
          }
          return this._super.apply(this, arguments);
        },
        _getOptions: function () {
          var options = {};
          if (this.initialProduct) {
            options["productID"] = this.initialProduct;
            return options;
          } else {
            return this._super.apply(this, arguments);
          }
        },
        _modifyElementsAfterAppend: function () {
          this._super.apply(this, arguments);
          this.trigger_up("widgets_start_request", {
            $target: this.$(".oe_website_sale"),
          });
          this._updateIDs(this._getBodySelectorElement());
        },
      },
    );
    publicWidget.registry.s_single_product_snippet = RootWidget.extend(
      ProductCarouselMixins,
      {
        selector: ".s_d_single_product_snippet_wrapper",
        drClearAttributes: (
          RootWidget.prototype.drClearAttributes || []
        ).concat(["data-products-params"]),
        bodyTemplate: "s_single_product_snippet",
        controllerRoute: "/droggol_theme_common/get_quick_view_html",
        bodySelector: ".d_single_product_continer",
        noDataTemplateString: _t("No product found"),
        noDataTemplateSubString: _t(
          "Sorry, this product is not available right now",
        ),
        displayAllProductsBtn: false,
        xmlDependencies: (RootWidget.prototype.xmlDependencies || []).concat([
          "/droggol_theme_common/static/src/xml/we_sale_snippets/s_single_product_snippet.xml",
        ]),
        start: function () {
          var productParams = this.$target.attr("data-products-params");
          this.productParams = productParams
            ? JSON.parse(productParams)
            : false;
          this.initialProduct = false;
          this.productIDs = false;
          if (this.productParams) {
            var productIDs = this.productParams.productIDs;
            if (productIDs.length) {
              this.initialProduct = productIDs[0];
              this.productIDs = productIDs;
            }
          }
          return this._super.apply(this, arguments);
        },
        _getOptions: function () {
          var options = {};
          if (this.initialProduct) {
            options["productID"] = this.initialProduct;
            return options;
          } else {
            return this._super.apply(this, arguments);
          }
        },
        _modifyElementsAfterAppend: function () {
          var self = this;
          this._super.apply(this, arguments);
          this.trigger_up("widgets_start_request", {
            $target: this.$(".oe_website_sale"),
          });
          this._updateIDs(this.$(".d_single_product_body[data-index=0]"));
          var $slider = this.$(".droggol_product_slider");
          $slider.owlCarousel({
            rewind: true,
            nav: true,
            margin: 20,
            rtl: _t.database.parameters.direction === "rtl",
            stagePadding: 5,
            navText: [
              '<i class="lnr lnr-arrow-left"></i>',
              '<i class="lnr lnr-arrow-right"></i>',
            ],
            responsive: { 0: { items: 1 } },
          });
          $slider.on("changed.owl.carousel", function (event) {
            var index = event.item.index;
            var $nextItem = self.$(
              ".d_single_product_body[data-index=" + index + "]",
            );
            if (!$.trim($nextItem.html()).length) {
              var productID = parseInt($nextItem.attr("data-product-id"), 10);
              self._fetchProductsHtml(productID);
            }
          });
        },
        _fetchProductsHtml: function (productID) {
          this._rpc({
            route: "/droggol_theme_common/get_quick_view_html",
            params: { options: { productID: productID } },
          }).then((data) => {
            var $target = this.$(
              ".d_single_product_body[data-product-id=" + productID + "]",
            );
            if (_.isArray(data)) {
              var $template = $(
                qweb.render(this.noDataTemplate, { data: data, widget: this }),
              );
              $template.appendTo($target);
            } else {
              $target.html(data);
              this._updateIDs($target);
              this.trigger_up("widgets_start_request", {
                $target: $target.find(".oe_website_sale"),
              });
            }
          });
        },
      },
    );
  },
);

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_products_collection.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_products_collection", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var ProductRootWidget = require("droggol_theme_common.product.root.widget");
  publicWidget.registry.s_products_collection = ProductRootWidget.extend({
    selector: ".s_d_products_collection",
    fieldstoFetch: ["rating", "public_categ_ids"],
    drClearAttributes: (
      ProductRootWidget.prototype.drClearAttributes || []
    ).concat(["data-collection-params", "data-collection-style"]),
    bodyTemplate: "d_s_cards_collection_wrapper",
    controllerRoute: "/droggol_theme_common/get_products_by_collection",
    xmlDependencies: (ProductRootWidget.prototype.xmlDependencies || []).concat(
      ["/droggol_theme_common/static/src/xml/cards_collection.xml"],
    ),
    start: function () {
      var collectionParams = this.$target.attr("data-collection-params");
      this.collectionParams = collectionParams
        ? JSON.parse(collectionParams)
        : false;
      var collectionStyle = this.$target.attr("data-collection-style");
      this.collectionStyle = collectionStyle
        ? JSON.parse(collectionStyle)
        : false;
      if (this.collectionParams) {
        this.numOfCol = 12 / this.collectionParams.length;
        if (this.numOfCol < 4) {
          this.numOfCol = 4;
        }
      }
      return this._super.apply(this, arguments);
    },
    _getOptions: function () {
      var options = {};
      if (this.collectionParams) {
        options["collections"] = this.collectionParams;
        return options;
      } else {
        return this._super.apply(this, arguments);
      }
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_top_categories.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_top_categories", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var RootWidget = require("droggol_theme_common.root.widget");
  var Mixins = require("droggol_theme_common.mixins");
  var CategoryMixins = Mixins.CategoryMixins;
  var _t = core._t;
  publicWidget.registry.s_d_top_categories = RootWidget.extend(CategoryMixins, {
    selector: ".s_d_top_categories",
    bodyTemplate: "s_top_categories_snippet",
    controllerRoute: "/droggol_theme_common/get_top_categories",
    drClearAttributes: (RootWidget.prototype.drClearAttributes || []).concat([
      "data-category-params",
    ]),
    xmlDependencies: (RootWidget.prototype.xmlDependencies || []).concat([
      "/droggol_theme_common/static/src/xml/we_sale_snippets/s_top_categories.xml",
    ]),
    noDataTemplateString: _t("No categories found!"),
    noDataTemplateSubString: false,
    displayAllProductsBtn: false,
    start: function () {
      var categoryParams = this.$target.attr("data-category-params");
      this.categoryParams = categoryParams ? JSON.parse(categoryParams) : false;
      return this._super.apply(this, arguments);
    },
    _getOptions: function () {
      var options = {};
      if (this.categoryParams) {
        this.categoryParams["sortBy"] = this._getParsedSortBy(
          this.categoryParams.sortBy,
        );
        options["params"] = this.categoryParams;
        return options;
      } else {
        return this._super.apply(this, arguments);
      }
    },
    _setDBData: function (data) {
      this._super.apply(this, arguments);
      var FetchedCategories = _.map(data, function (category) {
        return category.id;
      });
      var categoryIDs = [];
      _.each(this.categoryParams.categoryIDs, function (categoryID) {
        if (_.contains(FetchedCategories, categoryID)) {
          categoryIDs.push(categoryID);
        }
      });
      this.categoryParams.categoryIDs = categoryIDs;
    },
    _processData: function (data) {
      return _.map(this.categoryParams.categoryIDs, function (categoryID) {
        return _.findWhere(data, { id: categoryID });
      });
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/snippet_general.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.snippet_general", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.dr_s_coming_soon = publicWidget.Widget.extend({
    selector: ".s_coming_soon",
    disabledInEditableMode: false,
    start: function () {
      if (!this.editableMode || !this.$(".d_count_down_over").length) {
        $("body").css("overflow", "hidden");
      }
      if (this.editableMode) {
        this.$target.removeClass("d-none");
        $("body").css("overflow", "auto");
      }
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      $("body").css("overflow", "auto");
      this._super.apply(this, arguments);
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_custom_collection.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_custom_collection", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var ProductRootWidget = require("droggol_theme_common.product.root.widget");
  var core = require("web.core");
  var Mixins = require("droggol_theme_common.mixins");
  var OwlMixin = Mixins.OwlMixin;
  var qweb = core.qweb;
  publicWidget.registry.s_custom_collection = ProductRootWidget.extend(
    OwlMixin,
    {
      selector: ".s_d_custom_collection",
      drClearAttributes: (
        ProductRootWidget.prototype.drClearAttributes || []
      ).concat(["data-category-filter", "data-collection-params"]),
      read_events: _.extend(
        { "click .d_category_lable": "_onCategoryLableClick" },
        ProductRootWidget.prototype.read_events,
      ),
      bodyTemplate: "d_s_category_cards_wrapper",
      fieldstoFetch: [
        "name",
        "price",
        "description_sale",
        "dr_label_id",
        "rating",
        "public_categ_ids",
        "product_template_image_ids",
      ],
      controllerRoute: "/droggol_theme_common/_get_products_from_collection",
      xmlDependencies: (
        ProductRootWidget.prototype.xmlDependencies || []
      ).concat([
        "/droggol_theme_common/static/src/xml/cards.xml",
        "/droggol_theme_common/static/src/xml/category_filters.xml",
      ]),
      start: function () {
        var categoryFilterStyle = this.$target.attr("data-category-filter");
        var collectionParams = this.$target.attr("data-collection-params");
        this.collectionParams = collectionParams
          ? JSON.parse(collectionParams)
          : false;
        this.categoryFilterStyle = categoryFilterStyle
          ? JSON.parse(categoryFilterStyle)
          : false;
        this.categories = false;
        if (this.collectionParams) {
          this.categories = _.map(
            this.collectionParams,
            function (collection, index) {
              collection["id"] = index + 1;
              return { id: index + 1, name: collection.title };
            },
          );
          this.initialCategory = this.categories[0].id;
        }
        return this._super.apply(this, arguments);
      },
      _processData: function (data) {
        var products = data;
        if (
          this.collectionParams &&
          this.collectionParams[0].data.selectionType === "manual"
        ) {
          products = _.map(
            this.collectionParams[0].data.productIDs,
            function (product) {
              return _.findWhere(data, { id: product });
            },
          );
          products = _.compact(products);
        }
        return products;
      },
      _modifyElementsAfterAppend: function () {
        this._super.apply(this, arguments);
        if (this.userParams.layoutType === "slider") {
          this._initalizeOwlSlider(this.userParams.ppr);
        }
      },
      _activateCategory: function (categoryID) {
        this.$(".d_s_category_cards_item").addClass("d-none");
        this.$(
          ".d_s_category_cards_item[data-category-id=" + categoryID + "]",
        ).removeClass("d-none");
      },
      _getParameters: function () {
        var params = this._super.apply(this, arguments);
        if (this.initialCategory) {
          params["collection"] = this._getCollectionData(
            this.initialCategory,
          ).data;
        }
        return params;
      },
      _getCollectionData: function (collectionID) {
        return _.findWhere(this.collectionParams, { id: collectionID });
      },
      _renderNewProducts: function (products, categoryID) {
        var collection = this._getCollectionData(categoryID);
        if (collection.data.selectionType === "manual") {
          var filteredProducts = _.map(
            collection.data.productIDs,
            function (product) {
              return _.findWhere(products, { id: product });
            },
          );
          products = _.compact(filteredProducts);
        }
        var $tmpl = $(
          qweb.render("d_s_category_cards_item", {
            data: products,
            widget: this,
            categoryID: categoryID,
          }),
        );
        $tmpl.appendTo(this.$(".d_s_category_cards_container"));
        this._activateCategory(categoryID);
        this._initalizeOwlSlider(this.userParams.ppr);
      },
      _fetchProductsByColletion: function (ID) {
        return this._rpc({
          route: "/droggol_theme_common/_get_products_from_collection",
          params: {
            fields: this.fieldstoFetch,
            collection: this._getCollectionData(ID).data,
          },
        });
      },
      _onCategoryLableClick: function (ev) {
        var $target = $(ev.currentTarget);
        this.$(".d_category_lable").removeClass("d_active");
        $target.addClass("d_active");
        var categoryID = parseInt($target.attr("data-category-id"), 10);
        if (
          !this.$(
            ".d_s_category_cards_item[data-category-id=" + categoryID + "]",
          ).length
        ) {
          this._fetchProductsByColletion(categoryID).then((data) => {
            this._renderNewProducts(data, categoryID);
          });
        } else {
          this._activateCategory(categoryID);
        }
      },
    },
  );
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_d_brand_snippet.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_d_brand_snippet", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var RootWidget = require("droggol_theme_common.root.widget");
  var _t = core._t;
  publicWidget.registry.s_d_brand_snippet = RootWidget.extend({
    selector: ".s_d_brand_snippet_wrapper",
    controllerRoute: "/droggol_theme_common/get_brands",
    bodyTemplate: "s_d_brand_snippet",
    bodySelector: ".s_d_brand_snippet",
    fieldstoFetch: ["id"],
    displayAllProductsBtn: false,
    noDataTemplateString: _t("No brands are found!"),
    noDataTemplateSubString: _t("Sorry, We couldn't find any brands right now"),
    xmlDependencies: (RootWidget.prototype.xmlDependencies || []).concat([
      "/droggol_theme_common/static/src/xml/we_sale_snippets/s_d_brand_snippet.xml",
    ]),
    start: function () {
      var brandsCount = this.$target.attr("data-brand-limit");
      this.brandsCount = brandsCount ? JSON.parse(brandsCount) : 12;
      return this._super.apply(this, arguments);
    },
    _getOptions: function () {
      return { limit: this.brandsCount };
    },
    _modifyElementsAfterAppend: function () {
      this._super.apply(this, arguments);
      if (this.$target.hasClass("dr_slider_mode")) {
        this.$(".s_d_brand_snippet > .row").addClass("owl-carousel");
        this.$(".s_d_brand_snippet > .row > *").removeAttr("class");
        this.$(".s_d_brand_snippet > .row").removeClass("row");
        this.$(".owl-carousel").owlCarousel({
          nav: false,
          autoplay: true,
          autoplayTimeout: 4000,
          margin: 10,
          responsive: { 0: { items: 2 }, 576: { items: 4 } },
        });
      }
    },
  });
});

/* /droggol_theme_common/static/src/js/we_sale_snippets/s_dynamic_mega_menu.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("droggol_theme_common.s_dynamic_mega_menu", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var DroggolRootWidget = require("droggol_theme_common.root.widget");
  publicWidget.registry.s_d_category_mega_menu_3 = DroggolRootWidget.extend({
    selector: ".droggol_category_mega_menu_snippet",
    controllerRoute: "/droggol_theme_common/get_mega_menu_categories",
    xmlDependencies: (DroggolRootWidget.prototype.xmlDependencies || []).concat(
      [
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_dynamic_mega_menu.xml",
      ],
    ),
    bodyTemplate: "s_d_category_mega_menu_3",
    drClearAttributes: (
      DroggolRootWidget.prototype.drClearAttributes || []
    ).concat(["data-categories"]),
    start: function () {
      var categoryParams = this.$target.attr("data-categories");
      var categoryIDs = categoryParams ? JSON.parse(categoryParams) : false;
      this.categoryIDs = categoryIDs;
      return this._super.apply(this, arguments);
    },
    _getOptions: function () {
      return { categoryIDs: this.categoryIDs || [] };
    },
    _processData: function (data) {
      var categoryIDs = _.map(this.categoryIDs, function (categoryID) {
        var product = _.findWhere(data, { id: categoryID });
        if (product) {
          return product;
        }
      });
      return _.compact(categoryIDs);
    },
  });
  publicWidget.registry.s_d_category_mega_menu_1 = DroggolRootWidget.extend({
    selector: ".dr_category_mega_menu, .s_d_category_mega_menu_1",
    drClearAttributes: (
      DroggolRootWidget.prototype.drClearAttributes || []
    ).concat(["data-mega-menu-category-params"]),
    controllerRoute: "/droggol_theme_common/get_mega_menu_categories",
    xmlDependencies: (DroggolRootWidget.prototype.xmlDependencies || []).concat(
      [
        "/droggol_theme_common/static/src/xml/we_sale_snippets/s_dynamic_mega_menu.xml",
      ],
    ),
    start: function () {
      var self = this;
      this.bodyTemplate = this.$target.attr("data-ds-id");
      var categoryParams = this.$target.attr("data-mega-menu-category-params");
      var categoryInfo = categoryParams ? JSON.parse(categoryParams) : false;
      this.categoryParams = categoryInfo.categories;
      this.categoriesTofetch = [];
      _.each(this.categoryParams, function (category) {
        self.categoriesTofetch.push(category.id);
        _.each(category.child, function (c) {
          self.categoriesTofetch.push(c);
        });
      });
      return this._super.apply(this, arguments);
    },
    _getOptions: function () {
      return { categoryIDs: this.categoriesTofetch };
    },
    _processData: function (data) {
      var result = [];
      _.each(this.categoryParams, function (category) {
        var childCategories = [];
        _.each(category.child, function (child) {
          childCategories.push(_.findWhere(data, { id: child }));
        });
        result.push({
          parentCategory: _.findWhere(data, { id: category.id }),
          childCategories: _.compact(childCategories),
        });
      });
      return result;
    },
  });
});

/* /website_form/static/src/js/website_form.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_form.animation", function (require) {
  "use strict";
  var core = require("web.core");
  var time = require("web.time");
  var ajax = require("web.ajax");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  var qweb = core.qweb;
  publicWidget.registry.form_builder_send = publicWidget.Widget.extend({
    selector: ".s_website_form",
    willStart: function () {
      var prom;
      if (!$.fn.datetimepicker) {
        prom = ajax.loadJS("/web/static/lib/tempusdominus/tempusdominus.js");
      }
      return Promise.all([this._super.apply(this, arguments), prom]);
    },
    start: function (editable_mode) {
      if (editable_mode) {
        this.stop();
        return;
      }
      var self = this;
      this.templates_loaded = ajax.loadXML(
        "/website_form/static/src/xml/website_form.xml",
        qweb,
      );
      this.$target.find(".o_website_form_send").on("click", function (e) {
        self.send(e);
      });
      var l10n = _t.database.parameters;
      var datepickers_options = {
        minDate: moment({ y: 1900 }),
        maxDate: moment({ y: 9999, M: 11, d: 31 }),
        calendarWeeks: true,
        icons: {
          time: "fa fa-clock-o",
          date: "fa fa-calendar",
          next: "fa fa-chevron-right",
          previous: "fa fa-chevron-left",
          up: "fa fa-chevron-up",
          down: "fa fa-chevron-down",
        },
        locale: moment.locale(),
        format: time.getLangDatetimeFormat(),
      };
      this.$target
        .find(".o_website_form_datetime")
        .datetimepicker(datepickers_options);
      datepickers_options.format = time.getLangDateFormat();
      this.$target
        .find(".o_website_form_date")
        .datetimepicker(datepickers_options);
      var $values = $("[data-for=" + this.$target.attr("id") + "]");
      if ($values.length) {
        var values = JSON.parse(
          $values
            .data("values")
            .replace("False", '""')
            .replace("None", '""')
            .replace(/'/g, '"'),
        );
        var fields = _.pluck(this.$target.serializeArray(), "name");
        _.each(fields, function (field) {
          if (_.has(values, field)) {
            var $field = self.$target.find(
              'input[name="' + field + '"], textarea[name="' + field + '"]',
            );
            if (!$field.val()) {
              $field.val(values[field]);
              $field.data("website_form_original_default_value", $field.val());
            }
          }
        });
      }
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      this.$target.find("button").off("click");
    },
    send: function (e) {
      e.preventDefault();
      this.$target
        .find(".o_website_form_send")
        .off("click")
        .addClass("disabled")
        .attr("disabled", "disabled");
      var self = this;
      self.$target.find("#o_website_form_result").empty();
      if (!self.check_error_fields({})) {
        self.update_status("invalid");
        return false;
      }
      this.form_fields = this.$target.serializeArray();
      $.each(
        this.$target.find("input[type=file]"),
        function (outer_index, input) {
          $.each($(input).prop("files"), function (index, file) {
            self.form_fields.push({
              name: input.name + "[" + outer_index + "][" + index + "]",
              value: file,
            });
          });
        },
      );
      var form_values = {};
      _.each(this.form_fields, function (input) {
        if (input.name in form_values) {
          if (Array.isArray(form_values[input.name])) {
            form_values[input.name].push(input.value);
          } else {
            form_values[input.name] = [form_values[input.name], input.value];
          }
        } else {
          if (input.value !== "") {
            form_values[input.name] = input.value;
          }
        }
      });
      if (time.getLangDatetimeFormat().indexOf("MMM") !== 1) {
        this.$target
          .find(".form-field:not(.o_website_form_custom)")
          .find(".o_website_form_date, .o_website_form_datetime")
          .each(function () {
            var date = $(this).datetimepicker("viewDate").clone().locale("en");
            var format = "YYYY-MM-DD";
            if ($(this).hasClass("o_website_form_datetime")) {
              date = date.utc();
              format = "YYYY-MM-DD HH:mm:ss";
            }
            form_values[$(this).find("input").attr("name")] =
              date.format(format);
          });
      }
      self.post_form(form_values);
    },
    post_form: function (form_values) {
      var self = this;
      ajax
        .post(
          this.$target.attr("action") +
            (this.$target.data("force_action") ||
              this.$target.data("model_name")),
          form_values,
        )
        .then(function (result_data) {
          result_data = JSON.parse(result_data);
          if (!result_data.id) {
            self.update_status("error");
            if (result_data.error_fields) {
              self.check_error_fields(result_data.error_fields);
            }
          } else {
            var success_page = self.$target.attr("data-success_page");
            if (success_page) {
              $(window.location).attr("href", success_page);
            } else {
              self.update_status("success");
            }
            self.$target[0].reset();
          }
        })
        .guardedCatch(function () {
          self.update_status("error");
        });
    },
    check_error_fields: function (error_fields) {
      var self = this;
      var form_valid = true;
      this.$target.find(".form-field").each(function (k, field) {
        var $field = $(field);
        var field_name = $field.find(".col-form-label").attr("for");
        var inputs = $field.find(".o_website_form_input:not(#editable_select)");
        var invalid_inputs = inputs
          .toArray()
          .filter(function (input, k, inputs) {
            if (input.required && input.type === "checkbox") {
              var checkboxes = _.filter(inputs, function (input) {
                return input.required && input.type === "checkbox";
              });
              return !_.any(checkboxes, function (checkbox) {
                return checkbox.checked;
              });
            } else if ($(input).hasClass("o_website_form_date")) {
              if (!self.is_datetime_valid(input.value, "date")) {
                return true;
              }
            } else if ($(input).hasClass("o_website_form_datetime")) {
              if (!self.is_datetime_valid(input.value, "datetime")) {
                return true;
              }
            }
            return !input.checkValidity();
          });
        $field
          .removeClass("o_has_error")
          .find(".form-control, .custom-select")
          .removeClass("is-invalid");
        if (invalid_inputs.length || error_fields[field_name]) {
          $field
            .addClass("o_has_error")
            .find(".form-control, .custom-select")
            .addClass("is-invalid");
          if (_.isString(error_fields[field_name])) {
            $field.popover({
              content: error_fields[field_name],
              trigger: "hover",
              container: "body",
              placement: "top",
            });
            $field.data("bs.popover").config.content = error_fields[field_name];
            $field.popover("show");
          }
          form_valid = false;
        }
      });
      return form_valid;
    },
    is_datetime_valid: function (value, type_of_date) {
      if (value === "") {
        return true;
      } else {
        try {
          this.parse_date(value, type_of_date);
          return true;
        } catch (e) {
          return false;
        }
      }
    },
    parse_date: function (value, type_of_date, value_if_empty) {
      var date_pattern = time.getLangDateFormat(),
        time_pattern = time.getLangTimeFormat();
      var date_pattern_wo_zero = date_pattern
          .replace("MM", "M")
          .replace("DD", "D"),
        time_pattern_wo_zero = time_pattern
          .replace("HH", "H")
          .replace("mm", "m")
          .replace("ss", "s");
      switch (type_of_date) {
        case "datetime":
          var datetime = moment(
            value,
            [
              date_pattern + " " + time_pattern,
              date_pattern_wo_zero + " " + time_pattern_wo_zero,
            ],
            true,
          );
          if (datetime.isValid())
            return time.datetime_to_str(datetime.toDate());
          throw new Error(
            _.str.sprintf(_t("'%s' is not a correct datetime"), value),
          );
        case "date":
          var date = moment(value, [date_pattern, date_pattern_wo_zero], true);
          if (date.isValid()) return time.date_to_str(date.toDate());
          throw new Error(
            _.str.sprintf(_t("'%s' is not a correct date"), value),
          );
      }
      return value;
    },
    update_status: function (status) {
      var self = this;
      if (status !== "success") {
        this.$target
          .find(".o_website_form_send")
          .removeClass("disabled")
          .removeAttr("disabled")
          .on("click", function (e) {
            self.send(e);
          });
      }
      var $result = this.$("#o_website_form_result");
      this.templates_loaded.then(function () {
        $result.replaceWith(qweb.render("website_form.status_" + status));
      });
    },
  });
  return publicWidget.registry.form_builder_send;
});

/* /website_mail/static/src/js/follow.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_mail.follow", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.follow = publicWidget.Widget.extend({
    selector: ".js_follow",
    disabledInEditableMode: false,
    start: function () {
      var self = this;
      this.is_user = false;
      var always = function (data) {
        self.is_user = data.is_user;
        self.email = data.email;
        self.toggle_subscription(data.is_follower, data.email);
        self.$target.removeClass("d-none");
      };
      this._rpc({
        route: "/website_mail/is_follower",
        params: {
          model: this.$target.data("object"),
          res_id: this.$target.data("id"),
        },
      })
        .then(always)
        .guardedCatch(always);
      if (!this.editableMode) {
        $(".js_follow > .input-group-append.d-none").removeClass("d-none");
        this.$target
          .find(".js_follow_btn, .js_unfollow_btn")
          .on("click", function (event) {
            event.preventDefault();
            self._onClick();
          });
      }
      return this._super.apply(this, arguments);
    },
    _onClick: function () {
      var self = this;
      var $email = this.$target.find(".js_follow_email");
      if ($email.length && !$email.val().match(/.+@.+/)) {
        this.$target
          .addClass("o_has_error")
          .find(".form-control, .custom-select")
          .addClass("is-invalid");
        return false;
      }
      this.$target
        .removeClass("o_has_error")
        .find(".form-control, .custom-select")
        .removeClass("is-invalid");
      var email = $email.length ? $email.val() : false;
      if (email || this.is_user) {
        this._rpc({
          route: "/website_mail/follow",
          params: {
            id: +this.$target.data("id"),
            object: this.$target.data("object"),
            message_is_follower: this.$target.attr("data-follow") || "off",
            email: email,
          },
        }).then(function (follow) {
          self.toggle_subscription(follow, email);
        });
      }
    },
    toggle_subscription: function (follow, email) {
      follow = follow || (!email && this.$target.attr("data-unsubscribe"));
      if (follow) {
        this.$target.find(".js_follow_btn").addClass("d-none");
        this.$target.find(".js_unfollow_btn").removeClass("d-none");
      } else {
        this.$target.find(".js_follow_btn").removeClass("d-none");
        this.$target.find(".js_unfollow_btn").addClass("d-none");
      }
      this.$target
        .find("input.js_follow_email")
        .val(email || "")
        .attr(
          "disabled",
          email && (follow || this.is_user) ? "disabled" : false,
        );
      this.$target.attr("data-follow", follow ? "on" : "off");
    },
  });
});

/* /website_mail/static/src/js/portal_chatter.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_mail.thread", function (require) {
  "use strict";
  var portalChatter = require("portal.chatter");
  portalChatter.PortalChatter.include({
    xmlDependencies: (
      portalChatter.PortalChatter.prototype.xmlDependencies || []
    ).concat(["/website_mail/static/src/xml/portal_chatter.xml"]),
  });
});

/* /sale/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("sale.VariantMixin", function (require) {
  "use strict";
  var concurrency = require("web.concurrency");
  var core = require("web.core");
  var utils = require("web.utils");
  var ajax = require("web.ajax");
  var _t = core._t;
  var VariantMixin = {
    events: {
      "change .css_attribute_color input": "_onChangeColorAttribute",
      "change .main_product:not(.in_cart) input.js_quantity":
        "onChangeAddQuantity",
      "change [data-attribute_exclusions]": "onChangeVariant",
    },
    onChangeVariant: function (ev) {
      var $parent = $(ev.target).closest(".js_product");
      if (!$parent.data("uniqueId")) {
        $parent.data("uniqueId", _.uniqueId());
      }
      this._throttledGetCombinationInfo($parent.data("uniqueId"))(ev);
    },
    _getCombinationInfo: function (ev) {
      var self = this;
      if ($(ev.target).hasClass("variant_custom_value")) {
        return Promise.resolve();
      }
      var $parent = $(ev.target).closest(".js_product");
      var qty = $parent.find('input[name="add_qty"]').val();
      var combination = this.getSelectedVariantValues($parent);
      var parentCombination = $parent
        .find("ul[data-attribute_exclusions]")
        .data("attribute_exclusions").parent_combination;
      var productTemplateId = parseInt(
        $parent.find(".product_template_id").val(),
      );
      self._checkExclusions($parent, combination);
      return ajax
        .jsonRpc(this._getUri("/sale/get_combination_info"), "call", {
          product_template_id: productTemplateId,
          product_id: this._getProductId($parent),
          combination: combination,
          add_qty: parseInt(qty),
          pricelist_id: this.pricelistId || false,
          parent_combination: parentCombination,
        })
        .then(function (combinationData) {
          self._onChangeCombination(ev, $parent, combinationData);
        });
    },
    handleCustomValues: function ($target) {
      var $variantContainer;
      var $customInput = false;
      if ($target.is("input[type=radio]") && $target.is(":checked")) {
        $variantContainer = $target.closest("ul").closest("li");
        $customInput = $target;
      } else if ($target.is("select")) {
        $variantContainer = $target.closest("li");
        $customInput = $target.find('option[value="' + $target.val() + '"]');
      }
      if ($variantContainer) {
        if ($customInput && $customInput.data("is_custom") === "True") {
          var attributeValueId = $customInput.data("value_id");
          var attributeValueName = $customInput.data("value_name");
          if (
            $variantContainer.find(".variant_custom_value").length === 0 ||
            $variantContainer
              .find(".variant_custom_value")
              .data("custom_product_template_attribute_value_id") !==
              parseInt(attributeValueId)
          ) {
            $variantContainer.find(".variant_custom_value").remove();
            var $input = $("<input>", {
              type: "text",
              "data-custom_product_template_attribute_value_id":
                attributeValueId,
              "data-attribute_value_name": attributeValueName,
              class: "variant_custom_value form-control",
            });
            var isRadioInput =
              $target.is("input[type=radio]") &&
              $target.closest("label.css_attribute_color").length === 0;
            if (
              isRadioInput &&
              $customInput.data("is_single_and_custom") !== "True"
            ) {
              $input.addClass("custom_value_radio");
              $target.closest("div").after($input);
            } else {
              $input.attr("placeholder", attributeValueName);
              $input.addClass("custom_value_own_line");
              $variantContainer.append($input);
            }
          }
        } else {
          $variantContainer.find(".variant_custom_value").remove();
        }
      }
    },
    onClickAddCartJSON: function (ev) {
      ev.preventDefault();
      var $link = $(ev.currentTarget);
      var $input = $link.closest(".input-group").find("input");
      var min = parseFloat($input.data("min") || 0);
      var max = parseFloat($input.data("max") || Infinity);
      var previousQty = parseFloat($input.val() || 0, 10);
      var quantity = ($link.has(".fa-minus").length ? -1 : 1) + previousQty;
      var newQty = quantity > min ? (quantity < max ? quantity : max) : min;
      if (newQty !== previousQty) {
        $input.val(newQty).trigger("change");
      }
      return false;
    },
    onChangeAddQuantity: function (ev) {
      var $parent;
      if (
        $(ev.currentTarget).closest(".oe_optional_products_modal").length > 0
      ) {
        $parent = $(ev.currentTarget).closest(".oe_optional_products_modal");
      } else if ($(ev.currentTarget).closest("form").length > 0) {
        $parent = $(ev.currentTarget).closest("form");
      } else {
        $parent = $(ev.currentTarget).closest(".o_product_configurator");
      }
      this.triggerVariantChange($parent);
    },
    triggerVariantChange: function ($container) {
      var self = this;
      $container.find("ul[data-attribute_exclusions]").trigger("change");
      $container
        .find("input.js_variant_change:checked, select.js_variant_change")
        .each(function () {
          self.handleCustomValues($(this));
        });
    },
    getCustomVariantValues: function ($container) {
      var variantCustomValues = [];
      $container.find(".variant_custom_value").each(function () {
        var $variantCustomValueInput = $(this);
        if ($variantCustomValueInput.length !== 0) {
          variantCustomValues.push({
            custom_product_template_attribute_value_id:
              $variantCustomValueInput.data(
                "custom_product_template_attribute_value_id",
              ),
            attribute_value_name: $variantCustomValueInput.data(
              "attribute_value_name",
            ),
            custom_value: $variantCustomValueInput.val(),
          });
        }
      });
      return variantCustomValues;
    },
    getNoVariantAttributeValues: function ($container) {
      var noVariantAttributeValues = [];
      var variantsValuesSelectors = [
        "input.no_variant.js_variant_change:checked",
        "select.no_variant.js_variant_change",
      ];
      $container.find(variantsValuesSelectors.join(",")).each(function () {
        var $variantValueInput = $(this);
        var singleNoCustom =
          $variantValueInput.data("is_single") &&
          !$variantValueInput.data("is_custom");
        if ($variantValueInput.is("select")) {
          $variantValueInput = $variantValueInput.find(
            "option[value=" + $variantValueInput.val() + "]",
          );
        }
        if ($variantValueInput.length !== 0 && !singleNoCustom) {
          noVariantAttributeValues.push({
            custom_product_template_attribute_value_id:
              $variantValueInput.data("value_id"),
            attribute_value_name: $variantValueInput.data("value_name"),
            value: $variantValueInput.val(),
            attribute_name: $variantValueInput.data("attribute_name"),
            is_custom: $variantValueInput.data("is_custom"),
          });
        }
      });
      return noVariantAttributeValues;
    },
    getSelectedVariantValues: function ($container) {
      var values = [];
      var unchangedValues =
        $container
          .find("div.oe_unchanged_value_ids")
          .data("unchanged_value_ids") || [];
      var variantsValuesSelectors = [
        "input.js_variant_change:checked",
        "select.js_variant_change",
      ];
      _.each(
        $container.find(variantsValuesSelectors.join(", ")),
        function (el) {
          values.push(+$(el).val());
        },
      );
      return values.concat(unchangedValues);
    },
    selectOrCreateProduct: function (
      $container,
      productId,
      productTemplateId,
      useAjax,
    ) {
      var self = this;
      productId = parseInt(productId);
      productTemplateId = parseInt(productTemplateId);
      var productReady = Promise.resolve();
      if (productId) {
        productReady = Promise.resolve(productId);
      } else {
        var params = {
          product_template_id: productTemplateId,
          product_template_attribute_value_ids: JSON.stringify(
            self.getSelectedVariantValues($container),
          ),
        };
        var route = "/sale/create_product_variant";
        if (useAjax) {
          productReady = ajax.jsonRpc(route, "call", params);
        } else {
          productReady = this._rpc({ route: route, params: params });
        }
      }
      return productReady;
    },
    _checkExclusions: function ($parent, combination) {
      var self = this;
      var combinationData = $parent
        .find("ul[data-attribute_exclusions]")
        .data("attribute_exclusions");
      $parent
        .find("option, input, label")
        .removeClass("css_not_available")
        .attr("title", function () {
          return $(this).data("value_name") || "";
        })
        .data("excluded-by", "");
      if (combinationData.exclusions) {
        _.each(combination, function (current_ptav) {
          if (combinationData.exclusions.hasOwnProperty(current_ptav)) {
            _.each(
              combinationData.exclusions[current_ptav],
              function (excluded_ptav) {
                self._disableInput(
                  $parent,
                  excluded_ptav,
                  current_ptav,
                  combinationData.mapped_attribute_names,
                );
              },
            );
          }
        });
      }
      _.each(
        combinationData.parent_exclusions,
        function (exclusions, excluded_by) {
          _.each(exclusions, function (ptav) {
            self._disableInput(
              $parent,
              ptav,
              excluded_by,
              combinationData.mapped_attribute_names,
              combinationData.parent_product_name,
            );
          });
        },
      );
    },
    _getProductId: function ($parent) {
      return parseInt($parent.find(".product_id").val());
    },
    _disableInput: function (
      $parent,
      attributeValueId,
      excludedBy,
      attributeNames,
      productName,
    ) {
      var $input = $parent.find(
        "option[value=" +
          attributeValueId +
          "], input[value=" +
          attributeValueId +
          "]",
      );
      $input.addClass("css_not_available");
      $input.closest("label").addClass("css_not_available");
      if (excludedBy && attributeNames) {
        var $target = $input.is("option")
          ? $input
          : $input.closest("label").add($input);
        var excludedByData = [];
        if ($target.data("excluded-by")) {
          excludedByData = JSON.parse($target.data("excluded-by"));
        }
        var excludedByName = attributeNames[excludedBy];
        if (productName) {
          excludedByName = productName + " (" + excludedByName + ")";
        }
        excludedByData.push(excludedByName);
        $target.attr(
          "title",
          _.str.sprintf(_t("Not available with %s"), excludedByData.join(", ")),
        );
        $target.data("excluded-by", JSON.stringify(excludedByData));
      }
    },
    _onChangeCombination: function (ev, $parent, combination) {
      var self = this;
      var $price = $parent.find(".oe_price:first .oe_currency_value");
      var $default_price = $parent.find(
        ".oe_default_price:first .oe_currency_value",
      );
      var $optional_price = $parent.find(
        ".oe_optional:first .oe_currency_value",
      );
      $price.text(self._priceToStr(combination.price));
      $default_price.text(self._priceToStr(combination.list_price));
      var isCombinationPossible = true;
      if (!_.isUndefined(combination.is_combination_possible)) {
        isCombinationPossible = combination.is_combination_possible;
      }
      this._toggleDisable($parent, isCombinationPossible);
      if (combination.has_discounted_price) {
        $default_price.closest(".oe_website_sale").addClass("discount");
        $optional_price
          .closest(".oe_optional")
          .removeClass("d-none")
          .css("text-decoration", "line-through");
        $default_price.parent().removeClass("d-none");
      } else {
        $default_price.closest(".oe_website_sale").removeClass("discount");
        $optional_price.closest(".oe_optional").addClass("d-none");
        $default_price.parent().addClass("d-none");
      }
      var rootComponentSelectors = [
        "tr.js_product",
        ".oe_website_sale",
        ".o_product_configurator",
      ];
      if (
        !combination.product_id ||
        !this.last_product_id ||
        combination.product_id !== this.last_product_id
      ) {
        this.last_product_id = combination.product_id;
        self._updateProductImage(
          $parent.closest(rootComponentSelectors.join(", ")),
          combination.display_image,
          combination.product_id,
          combination.product_template_id,
          combination.carousel,
          isCombinationPossible,
        );
      }
      $parent
        .find(".product_id")
        .first()
        .val(combination.product_id || 0)
        .trigger("change");
      $parent
        .find(".product_display_name")
        .first()
        .text(combination.display_name);
      $parent
        .find(".js_raw_price")
        .first()
        .text(combination.price)
        .trigger("change");
      this.handleCustomValues($(ev.target));
    },
    _priceToStr: function (price) {
      var l10n = _t.database.parameters;
      var precision = 2;
      if ($(".decimal_precision").length) {
        precision = parseInt($(".decimal_precision").last().data("precision"));
      }
      var formatted = _.str.sprintf("%." + precision + "f", price).split(".");
      formatted[0] = utils.insert_thousand_seps(formatted[0]);
      return formatted.join(l10n.decimal_point);
    },
    _throttledGetCombinationInfo: _.memoize(function (uniqueId) {
      var dropMisordered = new concurrency.DropMisordered();
      var _getCombinationInfo = _.throttle(
        this._getCombinationInfo.bind(this),
        500,
      );
      return function (ev, params) {
        return dropMisordered.add(_getCombinationInfo(ev, params));
      };
    }),
    _toggleDisable: function ($parent, isCombinationPossible) {
      $parent.toggleClass("css_not_available", !isCombinationPossible);
    },
    _updateProductImage: function (
      $productContainer,
      displayImage,
      productId,
      productTemplateId,
    ) {
      var model = productId ? "product.product" : "product.template";
      var modelId = productId || productTemplateId;
      var imageUrl =
        "/web/image/{0}/{1}/" +
        (this._productImageField ? this._productImageField : "image_1024");
      var imageSrc = imageUrl.replace("{0}", model).replace("{1}", modelId);
      var imagesSelectors = [
        'span[data-oe-model^="product."][data-oe-type="image"] img:first',
        "img.product_detail_img",
        "span.variant_image img",
        "img.variant_image",
      ];
      var $img = $productContainer.find(imagesSelectors.join(", "));
      if (displayImage) {
        $img.removeClass("invisible").attr("src", imageSrc);
      } else {
        $img.addClass("invisible");
      }
    },
    _onChangeColorAttribute: function (ev) {
      var $parent = $(ev.target).closest(".js_product");
      $parent
        .find(".css_attribute_color")
        .removeClass("active")
        .filter(":has(input:checked)")
        .addClass("active");
    },
    _getUri: function (uri) {
      return uri;
    },
  };
  return VariantMixin;
});

/* /website_sale/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.VariantMixin", function (require) {
  "use strict";
  var VariantMixin = require("sale.VariantMixin");
  VariantMixin._getUri = function (uri) {
    if (this.isWebsite) {
      return uri + "_website";
    } else {
      return uri;
    }
  };
  return VariantMixin;
});

/* /sale_product_configurator/static/src/js/product_configurator_modal.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define(
  "sale_product_configurator.OptionalProductsModal",
  function (require) {
    "use strict";
    var ajax = require("web.ajax");
    var Dialog = require("web.Dialog");
    var ServicesMixin = require("web.ServicesMixin");
    var VariantMixin = require("sale.VariantMixin");
    var OptionalProductsModal = Dialog.extend(ServicesMixin, VariantMixin, {
      events: _.extend({}, Dialog.prototype.events, VariantMixin.events, {
        "click a.js_add, a.js_remove": "_onAddOrRemoveOption",
        "click button.js_add_cart_json": "onClickAddCartJSON",
        "change .in_cart input.js_quantity": "_onChangeQuantity",
        "change .js_raw_price": "_computePriceTotal",
      }),
      init: function (parent, params) {
        var self = this;
        var options = _.extend(
          {
            size: "large",
            buttons: [
              {
                text: params.okButtonText,
                click: this._onConfirmButtonClick,
                classes: "btn-primary",
              },
              {
                text: params.cancelButtonText,
                click: this._onCancelButtonClick,
              },
            ],
            technical: !params.isWebsite,
          },
          params || {},
        );
        this._super(parent, options);
        this.context = params.context;
        this.rootProduct = params.rootProduct;
        this.container = parent;
        this.pricelistId = params.pricelistId;
        this.previousModalHeight = params.previousModalHeight;
        this.dialogClass = "oe_optional_products_modal";
        this._productImageField = "image_128";
        this._opened.then(function () {
          if (self.previousModalHeight) {
            self.$el
              .closest(".modal-content")
              .css("min-height", self.previousModalHeight + "px");
          }
        });
      },
      willStart: function () {
        var self = this;
        var uri = this._getUri(
          "/sale_product_configurator/show_optional_products",
        );
        var getModalContent = ajax
          .jsonRpc(uri, "call", {
            product_id: self.rootProduct.product_id,
            variant_values: self.rootProduct.variant_values,
            pricelist_id: self.pricelistId || false,
            add_qty: self.rootProduct.quantity,
            kwargs: {
              context: _.extend(
                { quantity: self.rootProduct.quantity },
                this.context,
              ),
            },
          })
          .then(function (modalContent) {
            if (modalContent) {
              var $modalContent = $(modalContent);
              $modalContent = self._postProcessContent($modalContent);
              self.$content = $modalContent;
            } else {
              self.trigger("options_empty");
              self.preventOpening = true;
            }
          });
        var parentInit = self._super.apply(self, arguments);
        return Promise.all([getModalContent, parentInit]);
      },
      open: function (options) {
        $(".tooltip").remove();
        var self = this;
        this.appendTo($("<div/>")).then(function () {
          if (!self.preventOpening) {
            self.$modal.find(".modal-body").replaceWith(self.$el);
            self.$modal.attr("open", true);
            self.$modal.removeAttr("aria-hidden");
            self.$modal.modal().appendTo(self.container);
            self.$modal.focus();
            self._openedResolver();
          }
        });
        if (options && options.shouldFocusButtons) {
          self._onFocusControlButton();
        }
        return self;
      },
      start: function () {
        var def = this._super.apply(this, arguments);
        var self = this;
        this.$el.find('input[name="add_qty"]').val(this.rootProduct.quantity);
        var $products = this.$el.find("tr.js_product");
        _.each($products, function (el) {
          var $el = $(el);
          var uniqueId = self._getUniqueId(el);
          var productId = parseInt($el.find("input.product_id").val(), 10);
          if (productId === self.rootProduct.product_id) {
            self.rootProduct.unique_id = uniqueId;
          } else {
            el.dataset.parentUniqueId = self.rootProduct.unique_id;
          }
        });
        return def.then(function () {
          self._opened.then(function () {
            self.triggerVariantChange(self.$el);
          });
        });
      },
      getSelectedProducts: function () {
        var self = this;
        var products = [this.rootProduct];
        this.$modal
          .find(".js_product.in_cart:not(.main_product)")
          .each(function () {
            var $item = $(this);
            var quantity = parseInt(
              $item.find('input[name="add_qty"]').val(),
              10,
            );
            var parentUniqueId = this.dataset.parentUniqueId;
            var uniqueId = this.dataset.uniqueId;
            var productCustomVariantValues = self.getCustomVariantValues(
              $(this),
            );
            var noVariantAttributeValues = self.getNoVariantAttributeValues(
              $(this),
            );
            products.push({
              product_id: parseInt($item.find("input.product_id").val(), 10),
              product_template_id: parseInt(
                $item.find("input.product_template_id").val(),
                10,
              ),
              quantity: quantity,
              parent_unique_id: parentUniqueId,
              unique_id: uniqueId,
              product_custom_attribute_values: productCustomVariantValues,
              no_variant_attribute_values: noVariantAttributeValues,
            });
          });
        return products;
      },
      _postProcessContent: function ($modalContent) {
        var productId = this.rootProduct.product_id;
        $modalContent
          .find("img:first")
          .attr(
            "src",
            "/web/image/product.product/" + productId + "/image_128",
          );
        if (
          this.rootProduct &&
          (this.rootProduct.product_custom_attribute_values ||
            this.rootProduct.no_variant_attribute_values)
        ) {
          var $productDescription = $modalContent
            .find(".main_product")
            .find("td.td-product_name div.text-muted.small > div:first");
          var $updatedDescription = $("<div/>");
          $updatedDescription.append(
            $("<p>", { text: $productDescription.text() }),
          );
          $.each(this.rootProduct.product_custom_attribute_values, function () {
            $updatedDescription.append(
              $("<div>", {
                text: this.attribute_value_name + ": " + this.custom_value,
              }),
            );
          });
          $.each(this.rootProduct.no_variant_attribute_values, function () {
            if (this.is_custom !== "True") {
              $updatedDescription.append(
                $("<div>", {
                  text: this.attribute_name + ": " + this.attribute_value_name,
                }),
              );
            }
          });
          $productDescription.replaceWith($updatedDescription);
        }
        return $modalContent;
      },
      _onConfirmButtonClick: function () {
        this.trigger("confirm");
        this.close();
      },
      _onCancelButtonClick: function () {
        this.trigger("back");
        this.close();
      },
      _onAddOrRemoveOption: function (ev) {
        ev.preventDefault();
        var self = this;
        var $target = $(ev.currentTarget);
        var $modal = $target.parents(".oe_optional_products_modal");
        var $parent = $target.parents(".js_product:first");
        $parent.find("a.js_add, span.js_remove").toggleClass("d-none");
        $parent.find(".js_remove");
        var productTemplateId = $parent.find(".product_template_id").val();
        if ($target.hasClass("js_add")) {
          self._onAddOption($modal, $parent, productTemplateId);
        } else {
          self._onRemoveOption($modal, $parent);
        }
        self._computePriceTotal();
      },
      _onAddOption: function ($modal, $parent, productTemplateId) {
        var self = this;
        var $selectOptionsText = $modal.find(".o_select_options");
        var parentUniqueId = $parent[0].dataset.parentUniqueId;
        var $optionParent = $modal.find(
          'tr.js_product[data-unique-id="' + parentUniqueId + '"]',
        );
        $parent.find(".td-product_name").removeAttr("colspan");
        $parent.find(".td-qty").removeClass("d-none");
        var productCustomVariantValues = self.getCustomVariantValues($parent);
        var noVariantAttributeValues =
          self.getNoVariantAttributeValues($parent);
        if (productCustomVariantValues || noVariantAttributeValues) {
          var $productDescription = $parent.find(
            "td.td-product_name div.float-left",
          );
          var $customAttributeValuesDescription = $("<div>", {
            class: "custom_attribute_values_description text-muted small",
          });
          if (
            productCustomVariantValues.length !== 0 ||
            noVariantAttributeValues.length !== 0
          ) {
            $customAttributeValuesDescription.append($("<br/>"));
          }
          $.each(productCustomVariantValues, function () {
            $customAttributeValuesDescription.append(
              $("<div>", {
                text: this.attribute_value_name + ": " + this.custom_value,
              }),
            );
          });
          $.each(noVariantAttributeValues, function () {
            if (this.is_custom !== "True") {
              $customAttributeValuesDescription.append(
                $("<div>", {
                  text: this.attribute_name + ": " + this.attribute_value_name,
                }),
              );
            }
          });
          $productDescription.append($customAttributeValuesDescription);
        }
        var $tmpOptionParent = $optionParent;
        while ($tmpOptionParent.length) {
          $optionParent = $tmpOptionParent;
          $tmpOptionParent = $modal
            .find(
              'tr.js_product.in_cart[data-parent-unique-id="' +
                $optionParent[0].dataset.uniqueId +
                '"]',
            )
            .last();
        }
        $optionParent.after($parent);
        $parent.addClass("in_cart");
        this.selectOrCreateProduct(
          $parent,
          $parent.find(".product_id").val(),
          productTemplateId,
          true,
        ).then(function (productId) {
          $parent.find(".product_id").val(productId);
          ajax
            .jsonRpc(
              self._getUri("/sale_product_configurator/optional_product_items"),
              "call",
              {
                product_id: productId,
                pricelist_id: self.pricelistId || false,
              },
            )
            .then(function (addedItem) {
              var $addedItem = $(addedItem);
              $modal.find("tr:last").after($addedItem);
              self.$el.find('input[name="add_qty"]').trigger("change");
              self.triggerVariantChange($addedItem);
              var parentUniqueId = $parent[0].dataset.uniqueId;
              var parentQty = $parent.find('input[name="add_qty"]').val();
              $addedItem.filter(".js_product").each(function () {
                var $el = $(this);
                var uniqueId = self._getUniqueId(this);
                this.dataset.uniqueId = uniqueId;
                this.dataset.parentUniqueId = parentUniqueId;
                $el.find('input[name="add_qty"]').val(parentQty);
              });
              if ($selectOptionsText.nextAll(".js_product").length === 0) {
                $selectOptionsText.hide();
              }
            });
        });
      },
      _onRemoveOption: function ($modal, $parent) {
        var uniqueId = $parent[0].dataset.parentUniqueId;
        var qty = $modal
          .find('tr.js_product.in_cart[data-unique-id="' + uniqueId + '"]')
          .find('input[name="add_qty"]')
          .val();
        $parent.removeClass("in_cart");
        $parent.find(".td-product_name").attr("colspan", 2);
        $parent.find(".td-qty").addClass("d-none");
        $parent.find('input[name="add_qty"]').val(qty);
        $parent.find(".custom_attribute_values_description").remove();
        $modal.find(".o_select_options").show();
        var productUniqueId = $parent[0].dataset.uniqueId;
        this._removeOptionOption($modal, productUniqueId);
        $modal.find("tr:last").after($parent);
      },
      _removeOptionOption: function ($modal, optionUniqueId) {
        var self = this;
        $modal
          .find('tr.js_product[data-parent-unique-id="' + optionUniqueId + '"]')
          .each(function () {
            var uniqueId = this.dataset.uniqueId;
            $(this).remove();
            self._removeOptionOption($modal, uniqueId);
          });
      },
      _onChangeCombination: function (ev, $parent, combination) {
        $parent
          .find(".td-product_name .product-name")
          .first()
          .text(combination.display_name);
        VariantMixin._onChangeCombination.apply(this, arguments);
        this._computePriceTotal();
      },
      _onChangeQuantity: function (ev) {
        var $product = $(ev.target.closest("tr.js_product"));
        var qty = parseFloat($(ev.currentTarget).val());
        var uniqueId = $product[0].dataset.uniqueId;
        this.$el
          .find(
            'tr.js_product:not(.in_cart)[data-parent-unique-id="' +
              uniqueId +
              '"] input[name="add_qty"]',
          )
          .each(function () {
            $(this).val(qty);
          });
        if (this._triggerPriceUpdateOnChangeQuantity()) {
          this.onChangeAddQuantity(ev);
        }
        if ($product.hasClass("main_product")) {
          this.rootProduct.quantity = qty;
        }
        this.trigger("update_quantity", this.rootProduct.quantity);
        this._computePriceTotal();
      },
      _computePriceTotal: function () {
        if (this.$modal.find(".js_price_total").length) {
          var price = 0;
          this.$modal.find(".js_product.in_cart").each(function () {
            var quantity = parseInt(
              $(this).find('input[name="add_qty"]').first().val(),
              10,
            );
            price +=
              parseFloat($(this).find(".js_raw_price").html()) * quantity;
          });
          this.$modal
            .find(".js_price_total .oe_currency_value")
            .text(this._priceToStr(parseFloat(price)));
        }
      },
      _triggerPriceUpdateOnChangeQuantity: function () {
        return true;
      },
      _getUniqueId: function (el) {
        if (!el.dataset.uniqueId) {
          el.dataset.uniqueId = parseInt(_.uniqueId(), 10);
        }
        return el.dataset.uniqueId;
      },
    });
    return OptionalProductsModal;
  },
);

/* /website_sale_product_configurator/static/src/js/product_configurator_modal.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define(
  "website_sale_product_configurator.OptionalProductsModal",
  function (require) {
    "use strict";
    var OptionalProductsModal = require("sale_product_configurator.OptionalProductsModal");
    OptionalProductsModal.include({
      init: function (parent, params) {
        this._super.apply(this, arguments);
        this.isWebsite = params.isWebsite;
        this.dialogClass =
          "oe_optional_products_modal" +
          (params.isWebsite ? " oe_website_sale" : "");
      },
      _triggerPriceUpdateOnChangeQuantity: function () {
        return !this.isWebsite;
      },
    });
  },
);

/* /website_sale/static/src/js/website_sale.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.cart", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var core = require("web.core");
  var _t = core._t;
  var timeout;
  publicWidget.registry.websiteSaleCartLink = publicWidget.Widget.extend({
    selector: '#top_menu a[href$="/shop/cart"]',
    events: {
      mouseenter: "_onMouseEnter",
      mouseleave: "_onMouseLeave",
      click: "_onClick",
    },
    init: function () {
      this._super.apply(this, arguments);
      this._popoverRPC = null;
    },
    start: function () {
      this.$el.popover({
        trigger: "manual",
        animation: true,
        html: true,
        title: function () {
          return _t("My Cart");
        },
        container: "body",
        placement: "auto",
        template:
          '<div class="popover mycart-popover" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>',
      });
      return this._super.apply(this, arguments);
    },
    _onMouseEnter: function (ev) {
      var self = this;
      clearTimeout(timeout);
      $(this.selector).not(ev.currentTarget).popover("hide");
      timeout = setTimeout(function () {
        if (!self.$el.is(":hover") || $(".mycart-popover:visible").length) {
          return;
        }
        self._popoverRPC = $.get("/shop/cart", { type: "popover" }).then(
          function (data) {
            self.$el.data("bs.popover").config.content = data;
            self.$el.popover("show");
            $(".popover").on("mouseleave", function () {
              self.$el.trigger("mouseleave");
            });
          },
        );
      }, 300);
    },
    _onMouseLeave: function (ev) {
      var self = this;
      setTimeout(function () {
        if ($(".popover:hover").length) {
          return;
        }
        if (!self.$el.is(":hover")) {
          self.$el.popover("hide");
        }
      }, 1000);
    },
    _onClick: function (ev) {
      clearTimeout(timeout);
      if (this._popoverRPC && this._popoverRPC.state() === "pending") {
        ev.preventDefault();
        var href = ev.currentTarget.href;
        this._popoverRPC.then(function () {
          window.location.href = href;
        });
      }
    },
  });
});
odoo.define("website_sale.website_sale_category", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.websiteSaleCategory = publicWidget.Widget.extend({
    selector: "#o_shop_collapse_category",
    events: {
      "click .fa-chevron-right": "_onOpenClick",
      "click .fa-chevron-down": "_onCloseClick",
    },
    _onOpenClick: function (ev) {
      var $fa = $(ev.currentTarget);
      $fa.parent().siblings().find(".fa-chevron-down:first").click();
      $fa.parents("li").find("ul:first").show("normal");
      $fa.toggleClass("fa-chevron-down fa-chevron-right");
    },
    _onCloseClick: function (ev) {
      var $fa = $(ev.currentTarget);
      $fa.parent().find("ul:first").hide("normal");
      $fa.toggleClass("fa-chevron-down fa-chevron-right");
    },
  });
});
odoo.define("website_sale.website_sale", function (require) {
  "use strict";
  var core = require("web.core");
  var config = require("web.config");
  var concurrency = require("web.concurrency");
  var publicWidget = require("web.public.widget");
  var VariantMixin = require("sale.VariantMixin");
  var wSaleUtils = require("website_sale.utils");
  require("web.zoomodoo");
  var qweb = core.qweb;
  publicWidget.registry.WebsiteSale = publicWidget.Widget.extend(VariantMixin, {
    selector: ".oe_website_sale",
    events: _.extend({}, VariantMixin.events || {}, {
      'change form .js_product:first input[name="add_qty"]':
        "_onChangeAddQuantity",
      "mouseup .js_publish": "_onMouseupPublish",
      "touchend .js_publish": "_onMouseupPublish",
      "change .oe_cart input.js_quantity[data-product-id]":
        "_onChangeCartQuantity",
      "click .oe_cart a.js_add_suggested_products": "_onClickSuggestedProduct",
      "click a.js_add_cart_json": "_onClickAddCartJSON",
      "click .a-submit": "_onClickSubmit",
      "change form.js_attributes input, form.js_attributes select":
        "_onChangeAttribute",
      "mouseup form.js_add_cart_json label": "_onMouseupAddCartLabel",
      "touchend form.js_add_cart_json label": "_onMouseupAddCartLabel",
      "click .show_coupon": "_onClickShowCoupon",
      "submit .o_wsale_products_searchbar_form": "_onSubmitSaleSearch",
      'change select[name="country_id"]': "_onChangeCountry",
      "change #shipping_use_same": "_onChangeShippingUseSame",
      "click .toggle_summary": "_onToggleSummary",
      "click #add_to_cart, #buy_now, #products_grid .o_wsale_product_btn .a-submit":
        "async _onClickAdd",
      "click input.js_product_change": "onChangeVariant",
      "change .js_main_product [data-attribute_exclusions]": "onChangeVariant",
      "change oe_optional_products_modal [data-attribute_exclusions]":
        "onChangeVariant",
    }),
    init: function () {
      this._super.apply(this, arguments);
      this._changeCartQuantity = _.debounce(
        this._changeCartQuantity.bind(this),
        500,
      );
      this._changeCountry = _.debounce(this._changeCountry.bind(this), 500);
      this.isWebsite = true;
      delete this.events[
        "change .main_product:not(.in_cart) input.js_quantity"
      ];
      delete this.events["change [data-attribute_exclusions]"];
    },
    start: function () {
      var self = this;
      var def = this._super.apply(this, arguments);
      this._applyHash();
      _.each(this.$("div.js_product"), function (product) {
        $("input.js_product_change", product).first().trigger("change");
      });
      this.triggerVariantChange(this.$el);
      this.$('select[name="country_id"]').change();
      core.bus.on("resize", this, function () {
        if (config.device.size_class === config.device.SIZES.XL) {
          $(".toggle_summary_div").addClass("d-none d-xl-block");
        }
      });
      this._startZoom();
      window.addEventListener("hashchange", function (e) {
        self._applyHash();
        self.triggerVariantChange($(self.el));
      });
      return def;
    },
    getSelectedVariantValues: function ($container) {
      var combination = $container
        .find("input.js_product_change:checked")
        .data("combination");
      if (combination) {
        return combination;
      }
      return VariantMixin.getSelectedVariantValues.apply(this, arguments);
    },
    _applyHash: function () {
      var hash = window.location.hash.substring(1);
      if (hash) {
        var params = $.deparam(hash);
        if (params["attr"]) {
          var attributeIds = params["attr"].split(",");
          var $inputs = this.$(
            "input.js_variant_change, select.js_variant_change option",
          );
          _.each(attributeIds, function (id) {
            var $toSelect = $inputs.filter('[data-value_id="' + id + '"]');
            if ($toSelect.is('input[type="radio"]')) {
              $toSelect.prop("checked", true);
            } else if ($toSelect.is("option")) {
              $toSelect.prop("selected", true);
            }
          });
          this._changeColorAttribute();
        }
      }
    },
    _setUrlHash: function ($parent) {
      var $attributes = $parent.find(
        "input.js_variant_change:checked, select.js_variant_change option:selected",
      );
      var attributeIds = _.map($attributes, function (elem) {
        return $(elem).data("value_id");
      });
      history.replaceState(
        undefined,
        undefined,
        "#attr=" + attributeIds.join(","),
      );
    },
    _changeColorAttribute: function () {
      $(".css_attribute_color")
        .removeClass("active")
        .filter(":has(input:checked)")
        .addClass("active");
    },
    _changeCartQuantity: function (
      $input,
      value,
      $dom_optional,
      line_id,
      productIDs,
    ) {
      _.each($dom_optional, function (elem) {
        $(elem).find(".js_quantity").text(value);
        productIDs.push(
          $(elem).find("span[data-product-id]").data("product-id"),
        );
      });
      $input.data("update_change", true);
      this._rpc({
        route: "/shop/cart/update_json",
        params: {
          line_id: line_id,
          product_id: parseInt($input.data("product-id"), 10),
          set_qty: value,
        },
      }).then(function (data) {
        $input.data("update_change", false);
        var check_value = parseInt($input.val() || 0, 10);
        if (isNaN(check_value)) {
          check_value = 1;
        }
        if (value !== check_value) {
          $input.trigger("change");
          return;
        }
        if (!data.cart_quantity) {
          return (window.location = "/shop/cart");
        }
        wSaleUtils.updateCartNavBar(data);
        $input.val(data.quantity);
        $(".js_quantity[data-line-id=" + line_id + "]")
          .val(data.quantity)
          .html(data.quantity);
        if (data.warning) {
          var cart_alert = $(".oe_cart").parent().find("#data_warning");
          if (cart_alert.length === 0) {
            $(".oe_cart").prepend(
              '<div class="alert alert-danger alert-dismissable" role="alert" id="data_warning">' +
                '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> ' +
                data.warning +
                "</div>",
            );
          } else {
            cart_alert.html(
              '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> ' +
                data.warning,
            );
          }
          $input.val(data.quantity);
        }
      });
    },
    _changeCountry: function () {
      if (!$("#country_id").val()) {
        return;
      }
      this._rpc({
        route: "/shop/country_infos/" + $("#country_id").val(),
        params: { mode: "shipping" },
      }).then(function (data) {
        var selectStates = $("select[name='state_id']");
        if (
          selectStates.data("init") === 0 ||
          selectStates.find("option").length === 1
        ) {
          if (data.states.length) {
            selectStates.html("");
            _.each(data.states, function (x) {
              var opt = $("<option>")
                .text(x[1])
                .attr("value", x[0])
                .attr("data-code", x[2]);
              selectStates.append(opt);
            });
            selectStates.parent("div").show();
          } else {
            selectStates.val("").parent("div").hide();
          }
          selectStates.data("init", 0);
        } else {
          selectStates.data("init", 0);
        }
        if (data.fields) {
          if ($.inArray("zip", data.fields) > $.inArray("city", data.fields)) {
            $(".div_zip").before($(".div_city"));
          } else {
            $(".div_zip").after($(".div_city"));
          }
          var all_fields = ["street", "zip", "city", "country_name"];
          _.each(all_fields, function (field) {
            $(".checkout_autoformat .div_" + field.split("_")[0]).toggle(
              $.inArray(field, data.fields) >= 0,
            );
          });
        }
      });
    },
    _getProductId: function ($parent) {
      if ($parent.find("input.js_product_change").length !== 0) {
        return parseInt($parent.find("input.js_product_change:checked").val());
      } else {
        return VariantMixin._getProductId.apply(this, arguments);
      }
    },
    _startZoom: function () {
      if (!config.device.isMobile) {
        var autoZoom = $(".ecom-zoomable").data("ecom-zoom-auto") || false,
          attach = "#o-carousel-product";
        _.each($(".ecom-zoomable img[data-zoom]"), function (el) {
          onImageLoaded(el, function () {
            var $img = $(el);
            $img.zoomOdoo({
              event: autoZoom ? "mouseenter" : "click",
              attach: attach,
            });
            $img.attr("data-zoom", 1);
          });
        });
      }
      function onImageLoaded(img, callback) {
        $(img).on("load", function () {
          callback();
        });
        if (img.complete) {
          callback();
        }
      }
    },
    _updateProductImage: function (
      $productContainer,
      displayImage,
      productId,
      productTemplateId,
      newCarousel,
      isCombinationPossible,
    ) {
      var $carousel = $productContainer.find("#o-carousel-product");
      if (window.location.search.indexOf("enable_editor") === -1) {
        var $newCarousel = $(newCarousel);
        $carousel.after($newCarousel);
        $carousel.remove();
        $carousel = $newCarousel;
        $carousel.carousel(0);
        this._startZoom();
        this.trigger_up("widgets_start_request", { $target: $carousel });
      }
      $carousel.toggleClass("css_not_available", !isCombinationPossible);
    },
    _onClickAdd: function (ev) {
      ev.preventDefault();
      var def = () => {
        this.isBuyNow = $(ev.currentTarget).attr("id") === "buy_now";
        return this._handleAdd($(ev.currentTarget).closest("form"));
      };
      if ($(".js_add_cart_variants").children().length) {
        return this._getCombinationInfo(ev).then(() => {
          return !$(ev.target)
            .closest(".js_product")
            .hasClass("css_not_available")
            ? def()
            : Promise.resolve();
        });
      }
      return def();
    },
    _handleAdd: function ($form) {
      var self = this;
      this.$form = $form;
      var productSelector = [
        'input[type="hidden"][name="product_id"]',
        'input[type="radio"][name="product_id"]:checked',
      ];
      var productReady = this.selectOrCreateProduct(
        $form,
        parseInt($form.find(productSelector.join(", ")).first().val(), 10),
        $form.find(".product_template_id").val(),
        false,
      );
      return productReady.then(function (productId) {
        $form.find(productSelector.join(", ")).val(productId);
        self.rootProduct = {
          product_id: productId,
          quantity: parseFloat($form.find('input[name="add_qty"]').val() || 1),
          product_custom_attribute_values: self.getCustomVariantValues(
            $form.find(".js_product"),
          ),
          variant_values: self.getSelectedVariantValues(
            $form.find(".js_product"),
          ),
          no_variant_attribute_values: self.getNoVariantAttributeValues(
            $form.find(".js_product"),
          ),
        };
        return self._onProductReady();
      });
    },
    _onProductReady: function () {
      return this._submitForm();
    },
    _submitForm: function () {
      var $productCustomVariantValues = $("<input>", {
        name: "product_custom_attribute_values",
        type: "hidden",
        value: JSON.stringify(this.rootProduct.product_custom_attribute_values),
      });
      this.$form.append($productCustomVariantValues);
      var $productNoVariantAttributeValues = $("<input>", {
        name: "no_variant_attribute_values",
        type: "hidden",
        value: JSON.stringify(this.rootProduct.no_variant_attribute_values),
      });
      this.$form.append($productNoVariantAttributeValues);
      if (this.isBuyNow) {
        this.$form.append(
          $("<input>", { name: "express", type: "hidden", value: true }),
        );
      }
      this.$form.trigger("submit", [true]);
      return new Promise(function () {});
    },
    _onClickAddCartJSON: function (ev) {
      this.onClickAddCartJSON(ev);
    },
    _onChangeAddQuantity: function (ev) {
      this.onChangeAddQuantity(ev);
    },
    _onMouseupPublish: function (ev) {
      $(ev.currentTarget).parents(".thumbnail").toggleClass("disabled");
    },
    _onChangeCartQuantity: function (ev) {
      var $input = $(ev.currentTarget);
      if ($input.data("update_change")) {
        return;
      }
      var value = parseInt($input.val() || 0, 10);
      if (isNaN(value)) {
        value = 1;
      }
      var $dom = $input.closest("tr");
      var $dom_optional = $dom.nextUntil(":not(.optional_product.info)");
      var line_id = parseInt($input.data("line-id"), 10);
      var productIDs = [parseInt($input.data("product-id"), 10)];
      this._changeCartQuantity(
        $input,
        value,
        $dom_optional,
        line_id,
        productIDs,
      );
    },
    _onClickSuggestedProduct: function (ev) {
      $(ev.currentTarget).prev("input").val(1).trigger("change");
    },
    _onClickSubmit: function (ev, forceSubmit) {
      if (
        $(ev.currentTarget).is("#add_to_cart, #products_grid .a-submit") &&
        !forceSubmit
      ) {
        return;
      }
      var $aSubmit = $(ev.currentTarget);
      if (!ev.isDefaultPrevented() && !$aSubmit.is(".disabled")) {
        ev.preventDefault();
        $aSubmit.closest("form").submit();
      }
      if ($aSubmit.hasClass("a-submit-disable")) {
        $aSubmit.addClass("disabled");
      }
      if ($aSubmit.hasClass("a-submit-loading")) {
        var loading = '<span class="fa fa-cog fa-spin"/>';
        var fa_span = $aSubmit.find('span[class*="fa"]');
        if (fa_span.length) {
          fa_span.replaceWith(loading);
        } else {
          $aSubmit.append(loading);
        }
      }
    },
    _onChangeAttribute: function (ev) {
      if (!ev.isDefaultPrevented()) {
        ev.preventDefault();
        $(ev.currentTarget).closest("form").submit();
      }
    },
    _onMouseupAddCartLabel: function (ev) {
      var $label = $(ev.currentTarget);
      var $price = $label
        .parents("form:first")
        .find(".oe_price .oe_currency_value");
      if (!$price.data("price")) {
        $price.data("price", parseFloat($price.text()));
      }
      var value =
        $price.data("price") +
        parseFloat($label.find(".badge span").text() || 0);
      var dec = value % 1;
      $price.html(value + (dec < 0.01 ? ".00" : dec < 1 ? "0" : ""));
    },
    _onClickShowCoupon: function (ev) {
      $(ev.currentTarget).hide();
      $(".coupon_form").removeClass("d-none");
    },
    _onSubmitSaleSearch: function (ev) {
      if (!this.$(".dropdown_sorty_by").length) {
        return;
      }
      var $this = $(ev.currentTarget);
      if (!ev.isDefaultPrevented() && !$this.is(".disabled")) {
        ev.preventDefault();
        var oldurl = $this.attr("action");
        oldurl += oldurl.indexOf("?") === -1 ? "?" : "";
        var search = $this.find("input.search-query");
        window.location =
          oldurl +
          "&" +
          search.attr("name") +
          "=" +
          encodeURIComponent(search.val());
      }
    },
    _onChangeCountry: function (ev) {
      if (!this.$(".checkout_autoformat").length) {
        return;
      }
      this._changeCountry();
    },
    _onChangeShippingUseSame: function (ev) {
      $(".ship_to_other").toggle(!$(ev.currentTarget).prop("checked"));
    },
    _toggleDisable: function ($parent, isCombinationPossible) {
      VariantMixin._toggleDisable.apply(this, arguments);
      $parent
        .find("#add_to_cart")
        .toggleClass("disabled", !isCombinationPossible);
      $parent.find("#buy_now").toggleClass("disabled", !isCombinationPossible);
    },
    onChangeVariant: function (ev) {
      var $component = $(ev.currentTarget).closest(".js_product");
      $component.find("input").each(function () {
        var $el = $(this);
        $el.attr("checked", $el.is(":checked"));
      });
      $component.find("select option").each(function () {
        var $el = $(this);
        $el.attr("selected", $el.is(":selected"));
      });
      this._setUrlHash($component);
      return VariantMixin.onChangeVariant.apply(this, arguments);
    },
    _onToggleSummary: function () {
      $(".toggle_summary_div").toggleClass("d-none");
      $(".toggle_summary_div").removeClass("d-xl-block");
    },
  });
  publicWidget.registry.WebsiteSaleLayout = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    disabledInEditableMode: false,
    events: { "change .o_wsale_apply_layout": "_onApplyShopLayoutChange" },
    _onApplyShopLayoutChange: function (ev) {
      var switchToList = $(ev.currentTarget)
        .find(".o_wsale_apply_list input")
        .is(":checked");
      if (!this.editableMode) {
        this._rpc({
          route: "/shop/save_shop_layout_mode",
          params: { layout_mode: switchToList ? "list" : "grid" },
        });
      }
      var $grid = this.$("#products_grid");
      $grid.find("*").css("transition", "none");
      $grid.toggleClass("o_wsale_layout_list", switchToList);
      void $grid[0].offsetWidth;
      $grid.find("*").css("transition", "");
    },
  });
  publicWidget.registry.websiteSaleCart = publicWidget.Widget.extend({
    selector: ".oe_website_sale .oe_cart",
    events: {
      "click .js_change_shipping": "_onClickChangeShipping",
      "click .js_edit_address": "_onClickEditAddress",
      "click .js_delete_product": "_onClickDeleteProduct",
    },
    _onClickChangeShipping: function (ev) {
      var $old = $(".all_shipping").find(".card.border.border-primary");
      $old.find(".btn-ship").toggle();
      $old.addClass("js_change_shipping");
      $old.removeClass("border border-primary");
      var $new = $(ev.currentTarget).parent("div.one_kanban").find(".card");
      $new.find(".btn-ship").toggle();
      $new.removeClass("js_change_shipping");
      $new.addClass("border border-primary");
      var $form = $(ev.currentTarget)
        .parent("div.one_kanban")
        .find("form.d-none");
      $.post($form.attr("action"), $form.serialize() + "&xhr=1");
    },
    _onClickEditAddress: function (ev) {
      ev.preventDefault();
      $(ev.currentTarget)
        .closest("div.one_kanban")
        .find("form.d-none")
        .attr("action", "/shop/address")
        .submit();
    },
    _onClickDeleteProduct: function (ev) {
      ev.preventDefault();
      $(ev.currentTarget)
        .closest("tr")
        .find(".js_quantity")
        .val(0)
        .trigger("change");
    },
  });
  publicWidget.registry.productsSearchBar = publicWidget.Widget.extend({
    selector: ".o_wsale_products_searchbar_form",
    xmlDependencies: ["/website_sale/static/src/xml/website_sale_utils.xml"],
    events: {
      "input .search-query": "_onInput",
      focusout: "_onFocusOut",
      "keydown .search-query": "_onKeydown",
    },
    autocompleteMinWidth: 300,
    init: function () {
      this._super.apply(this, arguments);
      this._dp = new concurrency.DropPrevious();
      this._onInput = _.debounce(this._onInput, 400);
      this._onFocusOut = _.debounce(this._onFocusOut, 100);
    },
    start: function () {
      this.$input = this.$(".search-query");
      this.order = this.$(".o_wsale_search_order_by").val();
      this.limit = parseInt(this.$input.data("limit"));
      this.displayDescription = !!this.$input.data("displayDescription");
      this.displayPrice = !!this.$input.data("displayPrice");
      this.displayImage = !!this.$input.data("displayImage");
      if (this.limit) {
        this.$input.attr("autocomplete", "off");
      }
      return this._super.apply(this, arguments);
    },
    destroy() {
      this._super(...arguments);
      this._render(null);
    },
    _adaptToScrollingParent() {
      const bcr = this.el.getBoundingClientRect();
      this.$menu[0].style.setProperty("position", "fixed", "important");
      this.$menu[0].style.setProperty("top", `${bcr.bottom}px`, "important");
      this.$menu[0].style.setProperty("left", `${bcr.left}px`, "important");
      this.$menu[0].style.setProperty(
        "max-width",
        `${bcr.width}px`,
        "important",
      );
      this.$menu[0].style.setProperty(
        "max-height",
        `${document.body.clientHeight - bcr.bottom - 16}px`,
        "important",
      );
    },
    _fetch: function () {
      return this._rpc({
        route: "/shop/products/autocomplete",
        params: {
          term: this.$input.val(),
          options: {
            order: this.order,
            limit: this.limit,
            display_description: this.displayDescription,
            display_price: this.displayPrice,
            max_nb_chars: Math.round(
              Math.max(this.autocompleteMinWidth, parseInt(this.$el.width())) *
                0.22,
            ),
          },
        },
      });
    },
    _render: function (res) {
      if (this._scrollingParentEl) {
        this._scrollingParentEl.removeEventListener(
          "scroll",
          this._menuScrollAndResizeHandler,
        );
        document.removeEventListener(
          "resize",
          this._menuScrollAndResizeHandler,
        );
        delete this._scrollingParentEl;
        delete this._menuScrollAndResizeHandler;
      }
      var $prevMenu = this.$menu;
      this.$el.toggleClass("dropdown show", !!res);
      if (res) {
        var products = res["products"];
        this.$menu = $(
          qweb.render("website_sale.productsSearchBar.autocomplete", {
            products: products,
            hasMoreProducts: products.length < res["products_count"],
            currency: res["currency"],
            widget: this,
          }),
        );
        this.$menu.css("min-width", this.autocompleteMinWidth);
        const megaMenuEl = this.el.closest(".o_mega_menu");
        if (megaMenuEl) {
          const navbarEl = this.el.closest(".navbar");
          const navbarTogglerEl = navbarEl
            ? navbarEl.querySelector(".navbar-toggler")
            : null;
          if (navbarTogglerEl && navbarTogglerEl.clientWidth < 1) {
            this._scrollingParentEl = megaMenuEl;
            this._menuScrollAndResizeHandler = () =>
              this._adaptToScrollingParent();
            this._scrollingParentEl.addEventListener(
              "scroll",
              this._menuScrollAndResizeHandler,
            );
            document.addEventListener(
              "resize",
              this._menuScrollAndResizeHandler,
            );
            this._adaptToScrollingParent();
          }
        }
        this.$el.append(this.$menu);
      }
      if ($prevMenu) {
        $prevMenu.remove();
      }
    },
    _onInput: function () {
      if (!this.limit) {
        return;
      }
      this._dp.add(this._fetch()).then(this._render.bind(this));
    },
    _onFocusOut: function () {
      if (!this.$el.has(document.activeElement).length) {
        this._render();
      }
    },
    _onKeydown: function (ev) {
      switch (ev.which) {
        case $.ui.keyCode.ESCAPE:
          this._render();
          break;
        case $.ui.keyCode.UP:
        case $.ui.keyCode.DOWN:
          ev.preventDefault();
          if (this.$menu) {
            let $element =
              ev.which === $.ui.keyCode.UP
                ? this.$menu.children().last()
                : this.$menu.children().first();
            $element.focus();
          }
          break;
      }
    },
  });
});

/* /website_sale/static/src/js/website_sale_utils.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.utils", function (require) {
  "use strict";
  function getNavBarButton(selector) {
    var $affixedHeaderButton = $("header.affixed " + selector);
    if ($affixedHeaderButton.length) {
      return $affixedHeaderButton;
    } else {
      return $("header " + selector).first();
    }
  }
  function animateClone($cart, $elem, offsetTop, offsetLeft) {
    $cart
      .find(".o_animate_blink")
      .addClass("o_red_highlight o_shadow_animation")
      .delay(500)
      .queue(function () {
        $(this).removeClass("o_shadow_animation").dequeue();
      })
      .delay(2000)
      .queue(function () {
        $(this).removeClass("o_red_highlight").dequeue();
      });
    return new Promise(function (resolve, reject) {
      var $imgtodrag = $elem.find("img").eq(0);
      if ($imgtodrag.length) {
        var $imgclone = $imgtodrag
          .clone()
          .offset({
            top: $imgtodrag.offset().top,
            left: $imgtodrag.offset().left,
          })
          .addClass("o_website_sale_animate")
          .appendTo(document.body)
          .animate(
            {
              top: $cart.offset().top + offsetTop,
              left: $cart.offset().left + offsetLeft,
              width: 75,
              height: 75,
            },
            1000,
            "easeInOutExpo",
          );
        $imgclone.animate({ width: 0, height: 0 }, function () {
          resolve();
          $(this).detach();
        });
      } else {
        resolve();
      }
    });
  }
  function updateCartNavBar(data) {
    var $qtyNavBar = $(".my_cart_quantity");
    _.each($qtyNavBar, function (qty) {
      var $qty = $(qty);
      $qty.parents("li:first").removeClass("d-none");
      $qty.html(data.cart_quantity).hide().fadeIn(600);
    });
    $(".js_cart_lines")
      .first()
      .before(data["website_sale.cart_lines"])
      .end()
      .remove();
    $(".js_cart_summary")
      .first()
      .before(data["website_sale.short_cart_summary"])
      .end()
      .remove();
  }
  return {
    animateClone: animateClone,
    getNavBarButton: getNavBarButton,
    updateCartNavBar: updateCartNavBar,
  };
});

/* /website_sale/static/src/js/website_sale_payment.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.payment", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.WebsiteSalePayment = publicWidget.Widget.extend({
    selector: "#wrapwrap:has(#checkbox_cgv)",
    events: { "change #checkbox_cgv": "_onCGVCheckboxClick" },
    start: function () {
      this.$checkbox = this.$("#checkbox_cgv");
      this.$payButton = $("button#o_payment_form_pay");
      this.$checkbox.trigger("change");
      return this._super.apply(this, arguments);
    },
    _adaptPayButton: function () {
      var disabledReasons = this.$payButton.data("disabled_reasons") || {};
      disabledReasons.cgv = !this.$checkbox.prop("checked");
      this.$payButton.data("disabled_reasons", disabledReasons);
      this.$payButton.prop("disabled", _.contains(disabledReasons, true));
    },
    _onCGVCheckboxClick: function () {
      this._adaptPayButton();
    },
  });
});

/* /website_sale/static/src/js/website_sale_validate.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.validate", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var core = require("web.core");
  var _t = core._t;
  publicWidget.registry.websiteSaleValidate = publicWidget.Widget.extend({
    selector: "div.oe_website_sale_tx_status[data-order-id]",
    start: function () {
      var def = this._super.apply(this, arguments);
      this._poll_nbr = 0;
      this._paymentTransationPollStatus();
      return def;
    },
    _paymentTransationPollStatus: function () {
      var self = this;
      this._rpc({
        route:
          "/shop/payment/get_status/" + parseInt(this.$el.data("order-id")),
      }).then(function (result) {
        self._poll_nbr += 1;
        if (result.recall) {
          if (self._poll_nbr < 20) {
            setTimeout(
              function () {
                self._paymentTransationPollStatus();
              },
              Math.ceil(self._poll_nbr / 3) * 1000,
            );
          } else {
            var $message = $(result.message);
            var $warning = $(
              "<i class='fa fa-warning' style='margin-right:10px;'>",
            );
            $warning.attr(
              "title",
              _t(
                "We are waiting the confirmation of the bank or payment provider",
              ),
            );
            $message.find("span:first").prepend($warning);
            result.message = $message.html();
          }
        }
        self.$el.html(result.message);
      });
    },
  });
});

/* /website_sale/static/src/js/website_sale_recently_viewed.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.recently_viewed", function (require) {
  var concurrency = require("web.concurrency");
  var config = require("web.config");
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var utils = require("web.utils");
  var wSaleUtils = require("website_sale.utils");
  var qweb = core.qweb;
  publicWidget.registry.productsRecentlyViewedSnippet =
    publicWidget.Widget.extend({
      selector: ".s_wsale_products_recently_viewed",
      xmlDependencies: [
        "/website_sale/static/src/xml/website_sale_recently_viewed.xml",
      ],
      disabledInEditableMode: false,
      read_events: {
        "click .js_add_cart": "_onAddToCart",
        "click .js_remove": "_onRemove",
      },
      init: function () {
        this._super.apply(this, arguments);
        this._dp = new concurrency.DropPrevious();
        this.uniqueId = _.uniqueId("o_carousel_recently_viewed_products_");
        this._onResizeChange = _.debounce(this._addCarousel, 100);
      },
      start: function () {
        this._dp.add(this._fetch()).then(this._render.bind(this));
        $(window).resize(() => {
          this._onResizeChange();
        });
        return this._super.apply(this, arguments);
      },
      destroy: function () {
        this._super(...arguments);
        this.$el.addClass("d-none");
        this.$el.find(".slider").html("");
      },
      _fetch: function () {
        return this._rpc({ route: "/shop/products/recently_viewed" }).then(
          (res) => {
            var products = res["products"];
            if (this.editableMode && (!products || !products.length)) {
              return {
                products: [
                  {
                    id: 0,
                    website_url: "#",
                    display_name: "Product 1",
                    price: '$ <span class="oe_currency_value">750.00</span>',
                  },
                  {
                    id: 0,
                    website_url: "#",
                    display_name: "Product 2",
                    price: '$ <span class="oe_currency_value">750.00</span>',
                  },
                  {
                    id: 0,
                    website_url: "#",
                    display_name: "Product 3",
                    price: '$ <span class="oe_currency_value">750.00</span>',
                  },
                  {
                    id: 0,
                    website_url: "#",
                    display_name: "Product 4",
                    price: '$ <span class="oe_currency_value">750.00</span>',
                  },
                ],
              };
            }
            return res;
          },
        );
      },
      _render: function (res) {
        var products = res["products"];
        var mobileProducts = [],
          webProducts = [],
          productsTemp = [];
        _.each(products, function (product) {
          if (productsTemp.length === 4) {
            webProducts.push(productsTemp);
            productsTemp = [];
          }
          productsTemp.push(product);
          mobileProducts.push([product]);
        });
        if (productsTemp.length) {
          webProducts.push(productsTemp);
        }
        this.mobileCarousel = $(
          qweb.render("website_sale.productsRecentlyViewed", {
            uniqueId: this.uniqueId,
            productFrame: 1,
            productsGroups: mobileProducts,
          }),
        );
        this.webCarousel = $(
          qweb.render("website_sale.productsRecentlyViewed", {
            uniqueId: this.uniqueId,
            productFrame: 4,
            productsGroups: webProducts,
          }),
        );
        this._addCarousel();
        this.$el.toggleClass("d-none", !(products && products.length));
      },
      _addCarousel: function () {
        var carousel =
          config.device.size_class <= config.device.SIZES.SM
            ? this.mobileCarousel
            : this.webCarousel;
        this.$(".slider").html(carousel).css("display", "");
      },
      _onAddToCart: function (ev) {
        var self = this;
        var $card = $(ev.currentTarget).closest(".card");
        this._rpc({
          route: "/shop/cart/update_json",
          params: {
            product_id: $card.find("input[data-product-id]").data("product-id"),
            add_qty: 1,
          },
        }).then(function (data) {
          wSaleUtils.updateCartNavBar(data);
          var $navButton = wSaleUtils.getNavBarButton(".o_wsale_my_cart");
          var fetch = self._fetch();
          var animation = wSaleUtils.animateClone(
            $navButton,
            $(ev.currentTarget).parents(".o_carousel_product_card"),
            25,
            40,
          );
          Promise.all([fetch, animation]).then(function (values) {
            self._render(values[0]);
          });
        });
      },
      _onRemove: function (ev) {
        var self = this;
        var $card = $(ev.currentTarget).closest(".card");
        this._rpc({
          route: "/shop/products/recently_viewed_delete",
          params: {
            product_id: $card.find("input[data-product-id]").data("product-id"),
          },
        }).then(function (data) {
          self._render(data);
        });
      },
    });
  publicWidget.registry.productsRecentlyViewedUpdate =
    publicWidget.Widget.extend({
      selector: "#product_detail",
      events: {
        'change input.product_id[name="product_id"]': "_onProductChange",
      },
      debounceValue: 8000,
      init: function () {
        this._super.apply(this, arguments);
        this._onProductChange = _.debounce(
          this._onProductChange,
          this.debounceValue,
        );
      },
      _updateProductView: function ($input) {
        var productId = parseInt($input.val());
        var cookieName = "seen_product_id_" + productId;
        if (!parseInt(this.el.dataset.viewTrack, 10)) {
          return;
        }
        if (utils.get_cookie(cookieName)) {
          return;
        }
        if ($(this.el).find(".js_product.css_not_available").length) {
          return;
        }
        this._rpc({
          route: "/shop/products/recently_viewed_update",
          params: { product_id: productId },
        }).then(function (res) {
          if (res && res.visitor_uuid) {
            utils.set_cookie("visitor_uuid", res.visitor_uuid);
          }
          utils.set_cookie(cookieName, productId, 30 * 60);
        });
      },
      _onProductChange: function (ev) {
        this._updateProductView($(ev.currentTarget));
      },
    });
});

/* /website_sale/static/src/js/website_sale_tracking.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale.tracking", function (require) {
  var publicWidget = require("web.public.widget");
  publicWidget.registry.websiteSaleTracking = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    events: {
      'click form[action="/shop/cart/update"] a.a-submit':
        "_onAddProductIntoCart",
      'click a[href="/shop/checkout"]': "_onCheckoutStart",
      'click div.oe_cart a[href^="/web?redirect"][href$="/shop/checkout"]':
        "_onCustomerSignin",
      'click form[action="/shop/confirm_order"] a.a-submit': "_onOrder",
      'click form[target="_self"] button[type=submit]': "_onOrderPayment",
    },
    start: function () {
      var self = this;
      if (this.$el.is("#product_detail")) {
        var productID = this.$('input[name="product_id"]').attr("value");
        this._vpv("/stats/ecom/product_view/" + productID);
      }
      if (this.$("div.oe_website_sale_tx_status").length) {
        this._trackGA("require", "ecommerce");
        var orderID = this.$("div.oe_website_sale_tx_status").data("order-id");
        this._vpv("/stats/ecom/order_confirmed/" + orderID);
        this._rpc({ route: "/shop/tracking_last_order/" }).then(function (o) {
          self._trackGA("ecommerce:clear");
          if (o.transaction && o.lines) {
            self._trackGA("ecommerce:addTransaction", o.transaction);
            _.forEach(o.lines, function (line) {
              self._trackGA("ecommerce:addItem", line);
            });
          }
          self._trackGA("ecommerce:send");
        });
      }
      return this._super.apply(this, arguments);
    },
    _trackGA: function () {
      var websiteGA = window.ga || function () {};
      websiteGA.apply(this, arguments);
    },
    _vpv: function (page) {
      this._trackGA("send", "pageview", { page: page, title: document.title });
    },
    _onAddProductIntoCart: function () {
      var productID = this.$('input[name="product_id"]').attr("value");
      this._vpv("/stats/ecom/product_add_to_cart/" + productID);
    },
    _onCheckoutStart: function () {
      this._vpv("/stats/ecom/customer_checkout");
    },
    _onCustomerSignin: function () {
      this._vpv("/stats/ecom/customer_signin");
    },
    _onOrder: function () {
      if ($('#top_menu [href="/web/login"]').length) {
        this._vpv("/stats/ecom/customer_signup");
      }
      this._vpv("/stats/ecom/order_checkout");
    },
    _onOrderPayment: function () {
      var method = $("#payment_method input[name=acquirer]:checked")
        .nextAll("span:first")
        .text();
      this._vpv("/stats/ecom/order_payment/" + method);
    },
  });
});

/* /website_sale_comparison/static/src/js/website_sale_comparison.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale_comparison.comparison", function (require) {
  "use strict";
  var concurrency = require("web.concurrency");
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var utils = require("web.utils");
  var VariantMixin = require("sale.VariantMixin");
  var website_sale_utils = require("website_sale.utils");
  var qweb = core.qweb;
  var _t = core._t;
  var ProductComparison = publicWidget.Widget.extend(VariantMixin, {
    xmlDependencies: ["/website_sale_comparison/static/src/xml/comparison.xml"],
    template: "product_comparison_template",
    events: { "click .o_product_panel_header": "_onClickPanelHeader" },
    init: function () {
      this._super.apply(this, arguments);
      this.product_data = {};
      this.comparelist_product_ids = JSON.parse(
        utils.get_cookie("comparelist_product_ids") || "[]",
      );
      this.product_compare_limit = 4;
      this.guard = new concurrency.Mutex();
    },
    start: function () {
      var self = this;
      self._loadProducts(this.comparelist_product_ids).then(function () {
        self._updateContent("hide");
      });
      self._updateComparelistView();
      $("#comparelist .o_product_panel_header").popover({
        trigger: "manual",
        animation: true,
        html: true,
        title: function () {
          return _t("Compare Products");
        },
        container: ".o_product_feature_panel",
        placement: "top",
        template: qweb.render("popover"),
        content: function () {
          return $("#comparelist .o_product_panel_content").html();
        },
      });
      $(document.body).on(
        "click.product_comparaison_widget",
        ".comparator-popover .o_comparelist_products .o_remove",
        function (ev) {
          ev.preventDefault();
          self._removeFromComparelist(ev);
        },
      );
      $(document.body).on(
        "click.product_comparaison_widget",
        ".o_comparelist_remove",
        function (ev) {
          self._removeFromComparelist(ev);
          self.guard.exec(function () {
            var new_link =
              "/shop/compare/?products=" +
              self.comparelist_product_ids.toString();
            window.location.href = _.isEmpty(self.comparelist_product_ids)
              ? "/shop"
              : new_link;
          });
        },
      );
      return this._super.apply(this, arguments);
    },
    destroy: function () {
      this._super.apply(this, arguments);
      $(document.body).off(".product_comparaison_widget");
    },
    handleCompareAddition: function ($elem) {
      var self = this;
      if (this.comparelist_product_ids.length < this.product_compare_limit) {
        var productId = $elem.data("product-product-id");
        if ($elem.hasClass("o_add_compare_dyn")) {
          productId = $elem.parent().find(".product_id").val();
          if (!productId) {
            productId = $elem.parent().find("input:checked").first().val();
          }
        }
        this.selectOrCreateProduct(
          $elem.closest("form"),
          productId,
          $elem.closest("form").find(".product_template_id").val(),
          false,
        ).then(function (productId) {
          productId =
            parseInt(productId, 10) ||
            parseInt($elem.data("product-product-id"), 10);
          if (!productId) {
            return;
          }
          self._addNewProducts(productId).then(function () {
            website_sale_utils.animateClone(
              $("#comparelist .o_product_panel_header"),
              $elem.closest("form"),
              -50,
              10,
            );
          });
        });
      } else {
        this.$(".o_comparelist_limit_warning").show();
        $("#comparelist .o_product_panel_header").popover("show");
      }
    },
    _loadProducts: function (product_ids) {
      var self = this;
      return this._rpc({
        route: "/shop/get_product_data",
        params: {
          product_ids: product_ids,
          cookies: JSON.parse(
            utils.get_cookie("comparelist_product_ids") || "[]",
          ),
        },
      }).then(function (data) {
        self.comparelist_product_ids = JSON.parse(data.cookies);
        delete data.cookies;
        _.each(data, function (product) {
          self.product_data[product.product.id] = product;
        });
        if (product_ids.length > Object.keys(data).length) {
          self._updateCookie();
        }
      });
    },
    _togglePanel: function () {
      $("#comparelist .o_product_panel_header").popover("toggle");
    },
    _addNewProducts: function (product_id) {
      return this.guard.exec(this._addNewProductsImpl.bind(this, product_id));
    },
    _addNewProductsImpl: function (product_id) {
      var self = this;
      $(".o_product_feature_panel").addClass("d-md-block");
      if (!_.contains(self.comparelist_product_ids, product_id)) {
        self.comparelist_product_ids.push(product_id);
        if (_.has(self.product_data, product_id)) {
          self._updateContent();
        } else {
          return self._loadProducts([product_id]).then(function () {
            self._updateContent();
            self._updateCookie();
          });
        }
      }
      self._updateCookie();
    },
    _updateContent: function (force) {
      var self = this;
      this.$(".o_comparelist_products .o_product_row").remove();
      _.each(this.comparelist_product_ids, function (res) {
        var $template = self.product_data[res].render;
        self.$(".o_comparelist_products").append($template);
      });
      if (
        force !== "hide" &&
        (this.comparelist_product_ids.length > 1 || force === "show")
      ) {
        $("#comparelist .o_product_panel_header").popover("show");
      } else {
        $("#comparelist .o_product_panel_header").popover("hide");
      }
    },
    _removeFromComparelist: function (e) {
      this.guard.exec(this._removeFromComparelistImpl.bind(this, e));
    },
    _removeFromComparelistImpl: function (e) {
      var target = $(e.target.closest(".o_comparelist_remove, .o_remove"));
      this.comparelist_product_ids = _.without(
        this.comparelist_product_ids,
        target.data("product_product_id"),
      );
      target.parents(".o_product_row").remove();
      this._updateCookie();
      $(".o_comparelist_limit_warning").hide();
      this._updateContent("show");
    },
    _updateCookie: function () {
      document.cookie =
        "comparelist_product_ids=" +
        JSON.stringify(this.comparelist_product_ids) +
        "; path=/";
      this._updateComparelistView();
    },
    _updateComparelistView: function () {
      this.$(".o_product_circle").text(this.comparelist_product_ids.length);
      this.$(".o_comparelist_button").removeClass("d-md-block");
      if (_.isEmpty(this.comparelist_product_ids)) {
        $(".o_product_feature_panel").removeClass("d-md-block");
      } else {
        $(".o_product_feature_panel").addClass("d-md-block");
        this.$(".o_comparelist_products").addClass("d-md-block");
        if (this.comparelist_product_ids.length >= 2) {
          this.$(".o_comparelist_button").addClass("d-md-block");
          this.$(".o_comparelist_button a").attr(
            "href",
            "/shop/compare/?products=" +
              this.comparelist_product_ids.toString(),
          );
        }
      }
    },
    _onClickPanelHeader: function () {
      this._togglePanel();
    },
  });
  publicWidget.registry.ProductComparison = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    events: {
      "click .o_add_compare, .o_add_compare_dyn": "_onClickAddCompare",
      "click #o_comparelist_table tr": "_onClickComparelistTr",
    },
    start: function () {
      var def = this._super.apply(this, arguments);
      this.productComparison = new ProductComparison(this);
      return Promise.all([def, this.productComparison.appendTo(this.$el)]);
    },
    _onClickAddCompare: function (ev) {
      this.productComparison.handleCompareAddition($(ev.currentTarget));
    },
    _onClickComparelistTr: function (ev) {
      var $target = $(ev.currentTarget);
      $($target.data("target")).children().slideToggle(100);
      $target
        .find(".fa-chevron-circle-down, .fa-chevron-circle-right")
        .toggleClass("fa-chevron-circle-down fa-chevron-circle-right");
    },
  });
});

/* /website_sale_product_configurator/static/src/js/website_sale_options.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale_options.website_sale", function (require) {
  "use strict";
  var ajax = require("web.ajax");
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var OptionalProductsModal = require("sale_product_configurator.OptionalProductsModal");
  require("website_sale.website_sale");
  var _t = core._t;
  publicWidget.registry.WebsiteSale.include({
    _onProductReady: function () {
      if (this.isBuyNow) {
        return this._submitForm();
      }
      this.optionalProductsModal = new OptionalProductsModal(this.$form, {
        rootProduct: this.rootProduct,
        isWebsite: true,
        okButtonText: _t("Proceed to Checkout"),
        cancelButtonText: _t("Continue Shopping"),
        title: _t("Add to cart"),
        context: this._getContext(),
      }).open();
      this.optionalProductsModal.on(
        "options_empty",
        null,
        this._submitForm.bind(this),
      );
      this.optionalProductsModal.on(
        "update_quantity",
        null,
        this._onOptionsUpdateQuantity.bind(this),
      );
      this.optionalProductsModal.on(
        "confirm",
        null,
        this._onModalSubmit.bind(this, true),
      );
      this.optionalProductsModal.on(
        "back",
        null,
        this._onModalSubmit.bind(this, false),
      );
      return this.optionalProductsModal.opened();
    },
    _onOptionsUpdateQuantity: function (quantity) {
      var $qtyInput = this.$form
        .find('.js_main_product input[name="add_qty"]')
        .first();
      if ($qtyInput.length) {
        $qtyInput.val(quantity).trigger("change");
      } else {
        this.optionalProductsModal.triggerVariantChange(
          this.optionalProductsModal.$el,
        );
      }
    },
    _onModalSubmit: function (goToShop) {
      var productAndOptions = JSON.stringify(
        this.optionalProductsModal.getSelectedProducts(),
      );
      ajax
        .post("/shop/cart/update_option", {
          product_and_options: productAndOptions,
        })
        .then(function (quantity) {
          if (goToShop) {
            var path = "/shop/cart";
            window.location.pathname = path;
          }
          var $quantity = $(".my_cart_quantity");
          $quantity.parent().parent().removeClass("d-none");
          $quantity.html(quantity).hide().fadeIn(600);
        });
    },
  });
  return publicWidget.registry.WebsiteSaleOptions;
});

/* /website_sale_stock/static/src/js/variant_mixin.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale_stock.VariantMixin", function (require) {
  "use strict";
  var VariantMixin = require("sale.VariantMixin");
  var publicWidget = require("web.public.widget");
  var ajax = require("web.ajax");
  var core = require("web.core");
  var QWeb = core.qweb;
  var xml_load = ajax.loadXML(
    "/website_sale_stock/static/src/xml/website_sale_stock_product_availability.xml",
    QWeb,
  );
  VariantMixin._onChangeCombinationStock = function (ev, $parent, combination) {
    var product_id = 0;
    if ($parent.find("input.product_id:checked").length) {
      product_id = $parent.find("input.product_id:checked").val();
    } else {
      product_id = $parent.find(".product_id").val();
    }
    var isMainProduct =
      combination.product_id &&
      ($parent.is(".js_main_product") || $parent.is(".main_product")) &&
      combination.product_id === parseInt(product_id);
    if (!this.isWebsite || !isMainProduct) {
      return;
    }
    var qty = $parent.find('input[name="add_qty"]').val();
    $parent.find("#add_to_cart").removeClass("out_of_stock");
    $parent.find("#buy_now").removeClass("out_of_stock");
    if (
      combination.product_type === "product" &&
      _.contains(["always", "threshold"], combination.inventory_availability)
    ) {
      combination.virtual_available -= parseInt(combination.cart_qty);
      if (combination.virtual_available < 0) {
        combination.virtual_available = 0;
      }
      if (qty > combination.virtual_available) {
        var $input_add_qty = $parent.find('input[name="add_qty"]');
        qty = combination.virtual_available || 1;
        $input_add_qty.val(qty);
      }
      if (
        qty > combination.virtual_available ||
        combination.virtual_available < 1 ||
        qty < 1
      ) {
        $parent.find("#add_to_cart").addClass("disabled out_of_stock");
        $parent.find("#buy_now").addClass("disabled out_of_stock");
      }
    }
    xml_load.then(function () {
      $(".oe_website_sale")
        .find(".availability_message_" + combination.product_template)
        .remove();
      var $message = $(
        QWeb.render("website_sale_stock.product_availability", combination),
      );
      $("div.availability_messages").html($message);
    });
  };
  publicWidget.registry.WebsiteSale.include({
    _onChangeCombination: function () {
      this._super.apply(this, arguments);
      VariantMixin._onChangeCombinationStock.apply(this, arguments);
    },
  });
  return VariantMixin;
});

/* /website_sale_wishlist/static/src/js/website_sale_wishlist.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale_wishlist.wishlist", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var wSaleUtils = require("website_sale.utils");
  var VariantMixin = require("sale.VariantMixin");
  publicWidget.registry.ProductWishlist = publicWidget.Widget.extend(
    VariantMixin,
    {
      selector: ".oe_website_sale",
      events: {
        "click .o_wsale_my_wish": "_onClickMyWish",
        "click .o_add_wishlist, .o_add_wishlist_dyn": "_onClickAddWish",
        "change input.product_id": "_onChangeVariant",
        "change input.js_product_change": "_onChangeProduct",
        "click .wishlist-section .o_wish_rm": "_onClickWishRemove",
        "click .wishlist-section .o_wish_add": "_onClickWishAdd",
      },
      init: function (parent) {
        this._super.apply(this, arguments);
        this.wishlistProductIDs = [];
      },
      willStart: function () {
        var self = this;
        var def = this._super.apply(this, arguments);
        var wishDef = $.get("/shop/wishlist", { count: 1 }).then(
          function (res) {
            self.wishlistProductIDs = JSON.parse(res);
          },
        );
        return Promise.all([def, wishDef]);
      },
      start: function () {
        var def = this._super.apply(this, arguments);
        this._updateWishlistView();
        if (this.$("input.js_product_change").length) {
          this.$("input.js_product_change:checked").first().trigger("change");
        } else {
          this.$("input.product_id").first().trigger("change");
        }
        return def;
      },
      _addNewProducts: function ($el) {
        var self = this;
        var productID = $el.data("product-product-id");
        if ($el.hasClass("o_add_wishlist_dyn")) {
          productID = $el.parent().find(".product_id").val();
          if (!productID) {
            productID = $el.parent().find("input:checked").first().val();
          }
          productID = parseInt(productID, 10);
        }
        var $form = $el.closest("form");
        var templateId = $form.find(".product_template_id").val();
        if (!templateId) {
          templateId = $el.data("product-template-id");
        }
        $el.prop("disabled", true).addClass("disabled");
        var productReady = this.selectOrCreateProduct(
          $el.closest("form"),
          productID,
          templateId,
          false,
        );
        productReady
          .then(function (productId) {
            productId = parseInt(productId, 10);
            if (productId && !_.contains(self.wishlistProductIDs, productId)) {
              return self
                ._rpc({
                  route: "/shop/wishlist/add",
                  params: { product_id: productId },
                })
                .then(function () {
                  var $navButton =
                    wSaleUtils.getNavBarButton(".o_wsale_my_wish");
                  self.wishlistProductIDs.push(productId);
                  self._updateWishlistView();
                  wSaleUtils.animateClone(
                    $navButton,
                    $el.closest("form"),
                    25,
                    40,
                  );
                })
                .guardedCatch(function () {
                  $el.prop("disabled", false).removeClass("disabled");
                });
            }
          })
          .guardedCatch(function () {
            $el.prop("disabled", false).removeClass("disabled");
          });
      },
      _updateWishlistView: function () {
        if (this.wishlistProductIDs.length > 0) {
          $(".o_wsale_my_wish").show();
          $(".my_wish_quantity").text(this.wishlistProductIDs.length);
        } else {
          $(".o_wsale_my_wish").hide();
        }
      },
      _removeWish: function (e, deferred_redirect) {
        var tr = $(e.currentTarget).parents("tr");
        var wish = tr.data("wish-id");
        var product = tr.data("product-id");
        var self = this;
        this._rpc({ route: "/shop/wishlist/remove/" + wish }).then(function () {
          $(tr).hide();
        });
        this.wishlistProductIDs = _.without(this.wishlistProductIDs, product);
        if (this.wishlistProductIDs.length === 0) {
          if (deferred_redirect) {
            deferred_redirect.then(function () {
              self._redirectNoWish();
            });
          }
        }
        this._updateWishlistView();
      },
      _addOrMoveWish: function (e) {
        var $navButton = wSaleUtils.getNavBarButton(".o_wsale_my_cart");
        var tr = $(e.currentTarget).parents("tr");
        var product = tr.data("product-id");
        $(".o_wsale_my_cart").removeClass("d-none");
        wSaleUtils.animateClone($navButton, tr, 25, 40);
        if ($("#b2b_wish").is(":checked")) {
          return this._addToCart(product, tr.find("add_qty").val() || 1);
        } else {
          var adding_deffered = this._addToCart(
            product,
            tr.find("add_qty").val() || 1,
          );
          this._removeWish(e, adding_deffered);
          return adding_deffered;
        }
      },
      _addToCart: function (productID, qty_id) {
        return this._rpc({
          route: "/shop/cart/update_json",
          params: {
            product_id: parseInt(productID, 10),
            add_qty: parseInt(qty_id, 10),
            display: false,
          },
        }).then(function (resp) {
          if (resp.warning) {
            if (!$("#data_warning").length) {
              $(".wishlist-section").prepend(
                '<div class="mt16 alert alert-danger alert-dismissable" role="alert" id="data_warning"></div>',
              );
            }
            var cart_alert = $(".wishlist-section")
              .parent()
              .find("#data_warning");
            cart_alert.html(
              '<button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button> ' +
                resp.warning,
            );
          }
          $(".my_cart_quantity").html(
            resp.cart_quantity || '<i class="fa fa-warning" /> ',
          );
        });
      },
      _redirectNoWish: function () {
        window.location.href = "/shop/cart";
      },
      _onClickMyWish: function () {
        if (this.wishlistProductIDs.length === 0) {
          this._updateWishlistView();
          this._redirectNoWish();
          return;
        }
        window.location = "/shop/wishlist";
      },
      _onClickAddWish: function (ev) {
        this._addNewProducts($(ev.currentTarget));
      },
      _onChangeVariant: function (ev) {
        var $input = $(ev.target);
        var $parent = $input.closest(".js_product");
        var $el = $parent.find("[data-action='o_wishlist']");
        if (!_.contains(this.wishlistProductIDs, parseInt($input.val(), 10))) {
          $el
            .prop("disabled", false)
            .removeClass("disabled")
            .removeAttr("disabled");
        } else {
          $el
            .prop("disabled", true)
            .addClass("disabled")
            .attr("disabled", "disabled");
        }
        $el.data("product-product-id", parseInt($input.val(), 10));
      },
      _onChangeProduct: function (ev) {
        var productID = ev.currentTarget.value;
        var $el = $(ev.target)
          .closest(".js_add_cart_variants")
          .find("[data-action='o_wishlist']");
        if (!_.contains(this.wishlistProductIDs, parseInt(productID, 10))) {
          $el
            .prop("disabled", false)
            .removeClass("disabled")
            .removeAttr("disabled");
        } else {
          $el
            .prop("disabled", true)
            .addClass("disabled")
            .attr("disabled", "disabled");
        }
        $el.data("product-product-id", productID);
      },
      _onClickWishRemove: function (ev) {
        this._removeWish(ev, false);
      },
      _onClickWishAdd: function (ev) {
        var self = this;
        this.$(".wishlist-section .o_wish_add").addClass("disabled");
        this._addOrMoveWish(ev).then(function () {
          self.$(".wishlist-section .o_wish_add").removeClass("disabled");
        });
      },
    },
  );
});

/* /website_sale_delivery/static/src/js/website_sale_delivery.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_sale_delivery.checkout", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  var concurrency = require("web.concurrency");
  var dp = new concurrency.DropPrevious();
  publicWidget.registry.websiteSaleDelivery = publicWidget.Widget.extend({
    selector: ".oe_website_sale",
    events: {
      'change select[name="shipping_id"]': "_onSetAddress",
      "click #delivery_carrier .o_delivery_carrier_select": "_onCarrierClick",
    },
    start: function () {
      var self = this;
      var $carriers = $('#delivery_carrier input[name="delivery_type"]');
      var $payButton = $("#o_payment_form_pay");
      if ($carriers.length > 0) {
        if ($carriers.filter(":checked").length === 0) {
          $payButton.prop("disabled", true);
          var disabledReasons = $payButton.data("disabled_reasons") || {};
          disabledReasons.carrier_selection = true;
          $payButton.data("disabled_reasons", disabledReasons);
        }
        $carriers.filter(":checked").click();
      }
      _.each($carriers, function (carrierInput, k) {
        self._showLoading($(carrierInput));
        self
          ._rpc({
            route: "/shop/carrier_rate_shipment",
            params: { carrier_id: carrierInput.value },
          })
          .then(self._handleCarrierUpdateResultBadge.bind(self));
      });
      return this._super.apply(this, arguments);
    },
    _showLoading: function ($carrierInput) {
      $carrierInput
        .siblings(".o_wsale_delivery_badge_price")
        .html('<span class="fa fa-spinner fa-spin"/>');
    },
    _handleCarrierUpdateResult: function (result) {
      this._handleCarrierUpdateResultBadge(result);
      var $payButton = $("#o_payment_form_pay");
      var $amountDelivery = $("#order_delivery .monetary_field");
      var $amountUntaxed = $("#order_total_untaxed .monetary_field");
      var $amountTax = $("#order_total_taxes .monetary_field");
      var $amountTotal = $(
        "#order_total .monetary_field, #amount_total_summary.monetary_field",
      );
      if (result.status === true) {
        $amountDelivery.html(result.new_amount_delivery);
        $amountUntaxed.html(result.new_amount_untaxed);
        $amountTax.html(result.new_amount_tax);
        $amountTotal.html(result.new_amount_total);
        var disabledReasons = $payButton.data("disabled_reasons") || {};
        disabledReasons.carrier_selection = false;
        $payButton.data("disabled_reasons", disabledReasons);
        $payButton.prop(
          "disabled",
          _.contains($payButton.data("disabled_reasons"), true),
        );
      } else {
        $amountDelivery.html(result.new_amount_delivery);
        $amountUntaxed.html(result.new_amount_untaxed);
        $amountTax.html(result.new_amount_tax);
        $amountTotal.html(result.new_amount_total);
      }
    },
    _handleCarrierUpdateResultBadge: function (result) {
      var $carrierBadge = $(
        '#delivery_carrier input[name="delivery_type"][value=' +
          result.carrier_id +
          "] ~ .o_wsale_delivery_badge_price",
      );
      if (result.status === true) {
        if (result.is_free_delivery) {
          $carrierBadge.text(_t("Free"));
        } else {
          $carrierBadge.html(result.new_amount_delivery);
        }
        $carrierBadge.removeClass("o_wsale_delivery_carrier_error");
      } else {
        $carrierBadge.addClass("o_wsale_delivery_carrier_error");
        $carrierBadge.text(result.error_message);
      }
    },
    _onCarrierClick: function (ev) {
      var $radio = $(ev.currentTarget).find('input[type="radio"]');
      this._showLoading($radio);
      $radio.prop("checked", true);
      var $payButton = $("#o_payment_form_pay");
      $payButton.prop("disabled", true);
      var disabledReasons = $payButton.data("disabled_reasons") || {};
      disabledReasons.carrier_selection = true;
      $payButton.data("disabled_reasons", disabledReasons);
      dp.add(
        this._rpc({
          route: "/shop/update_carrier",
          params: { carrier_id: $radio.val() },
        }),
      ).then(this._handleCarrierUpdateResult.bind(this));
    },
    _onSetAddress: function (ev) {
      var value = $(ev.currentTarget).val();
      var $providerFree = $(
        'select[name="country_id"]:not(.o_provider_restricted), select[name="state_id"]:not(.o_provider_restricted)',
      );
      var $providerRestricted = $(
        'select[name="country_id"].o_provider_restricted, select[name="state_id"].o_provider_restricted',
      );
      if (value === 0) {
        $providerFree.hide().attr("disabled", true);
        $providerRestricted.show().attr("disabled", false).change();
      } else {
        $providerFree.show().attr("disabled", false).change();
        $providerRestricted.hide().attr("disabled", true);
      }
    },
  });
});

/* /website_links/static/src/js/website_links.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_links.website_links", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  var SelectBox = publicWidget.Widget.extend({
    events: { change: "_onChange" },
    init: function (parent, obj, placeholder) {
      this._super.apply(this, arguments);
      this.obj = obj;
      this.placeholder = placeholder;
    },
    willStart: function () {
      var self = this;
      var defs = [this._super.apply(this, arguments)];
      defs.push(
        this._rpc({
          model: this.obj,
          method: "search_read",
          params: { fields: ["id", "name"] },
        }).then(function (result) {
          self.objects = _.map(result, function (val) {
            return { id: val.id, text: val.name };
          });
        }),
      );
      return Promise.all(defs);
    },
    start: function () {
      var self = this;
      this.$el.select2({
        placeholder: self.placeholder,
        allowClear: true,
        createSearchChoice: function (term) {
          if (self._objectExists(term)) {
            return null;
          }
          return { id: term, text: _.str.sprintf("Create '%s'", term) };
        },
        createSearchChoicePosition: "bottom",
        multiple: false,
        data: self.objects,
        minimumInputLength: self.objects.length > 100 ? 3 : 0,
      });
    },
    _objectExists: function (query) {
      return (
        _.find(this.objects, function (val) {
          return val.text.toLowerCase() === query.toLowerCase();
        }) !== undefined
      );
    },
    _createObject: function (name) {
      var self = this;
      var args = { name: name };
      if (this.obj === "utm.campaign") {
        args.is_website = true;
      }
      return this._rpc({
        model: this.obj,
        method: "create",
        args: [args],
      }).then(function (record) {
        self.$el.attr("value", record);
        self.objects.push({ id: record, text: name });
      });
    },
    _onChange: function (ev) {
      if (!ev.added || !_.isString(ev.added.id)) {
        return;
      }
      this._createObject(ev.added.id);
    },
  });
  var RecentLinkBox = publicWidget.Widget.extend({
    template: "website_links.RecentLink",
    xmlDependencies: ["/website_links/static/src/xml/recent_link.xml"],
    events: {
      "click .btn_shorten_url_clipboard": "_toggleCopyButton",
      "click .o_website_links_edit_code": "_editCode",
      "click .o_website_links_ok_edit": "_onLinksOkClick",
      "click .o_website_links_cancel_edit": "_onLinksCancelClick",
      "submit #o_website_links_edit_code_form": "_onSubmitCode",
    },
    init: function (parent, obj) {
      this._super.apply(this, arguments);
      this.link_obj = obj;
      this.animating_copy = false;
    },
    start: function () {
      new ClipboardJS(this.$(".btn_shorten_url_clipboard").get(0));
      return this._super.apply(this, arguments);
    },
    _toggleCopyButton: function () {
      if (this.animating_copy) {
        return;
      }
      var self = this;
      this.animating_copy = true;
      var top = this.$(".o_website_links_short_url").position().top;
      this.$(".o_website_links_short_url")
        .clone()
        .css("position", "absolute")
        .css("left", 15)
        .css("top", top - 2)
        .css("z-index", 2)
        .removeClass("o_website_links_short_url")
        .addClass("animated-link")
        .insertAfter(this.$(".o_website_links_short_url"))
        .animate({ opacity: 0, top: "-=20" }, 500, function () {
          self.$(".animated-link").remove();
          self.animating_copy = false;
        });
    },
    _notification: function (message) {
      this.$(".notification").append("<strong>" + message + "</strong>");
    },
    _editCode: function () {
      var initCode = this.$("#o_website_links_code").html();
      this.$("#o_website_links_code").html(
        '<form style="display:inline;" id="o_website_links_edit_code_form"><input type="hidden" id="init_code" value="' +
          initCode +
          '"/><input type="text" id="new_code" value="' +
          initCode +
          '"/></form>',
      );
      this.$(".o_website_links_edit_code").hide();
      this.$(".copy-to-clipboard").hide();
      this.$(".o_website_links_edit_tools").show();
    },
    _cancelEdit: function () {
      this.$(".o_website_links_edit_code").show();
      this.$(".copy-to-clipboard").show();
      this.$(".o_website_links_edit_tools").hide();
      this.$(".o_website_links_code_error").hide();
      var oldCode = this.$("#o_website_links_edit_code_form #init_code").val();
      this.$("#o_website_links_code").html(oldCode);
      this.$("#code-error").remove();
      this.$("#o_website_links_code form").remove();
    },
    _submitCode: function () {
      var self = this;
      var initCode = this.$("#o_website_links_edit_code_form #init_code").val();
      var newCode = this.$("#o_website_links_edit_code_form #new_code").val();
      if (newCode === "") {
        self
          .$(".o_website_links_code_error")
          .html(_t("The code cannot be left empty"));
        self.$(".o_website_links_code_error").show();
        return;
      }
      function showNewCode(newCode) {
        self.$(".o_website_links_code_error").html("");
        self.$(".o_website_links_code_error").hide();
        self.$("#o_website_links_code form").remove();
        var host = self.$("#o_website_links_host").html();
        self.$("#o_website_links_code").html(newCode);
        self
          .$(".btn_shorten_url_clipboard")
          .attr("data-clipboard-text", host + newCode);
        self.$(".o_website_links_edit_code").show();
        self.$(".copy-to-clipboard").show();
        self.$(".o_website_links_edit_tools").hide();
      }
      if (initCode === newCode) {
        showNewCode(newCode);
      } else {
        this._rpc({
          route: "/website_links/add_code",
          params: { init_code: initCode, new_code: newCode },
        }).then(
          function (result) {
            showNewCode(result[0].code);
          },
          function () {
            self.$(".o_website_links_code_error").show();
            self
              .$(".o_website_links_code_error")
              .html(_t("This code is already taken"));
          },
        );
      }
    },
    _onLinksOkClick: function (ev) {
      ev.preventDefault();
      this._submitCode();
    },
    _onLinksCancelClick: function (ev) {
      ev.preventDefault();
      this._cancelEdit();
    },
    _onSubmitCode: function (ev) {
      ev.preventDefault();
      this._submitCode();
    },
  });
  var RecentLinks = publicWidget.Widget.extend({
    getRecentLinks: function (filter) {
      var self = this;
      return this._rpc({
        route: "/website_links/recent_links",
        params: { filter: filter, limit: 20 },
      }).then(
        function (result) {
          _.each(result.reverse(), function (link) {
            self._addLink(link);
          });
          self._updateNotification();
        },
        function () {
          var message = _t("Unable to get recent links");
          self.$el.append(
            '<div class="alert alert-danger">' + message + "</div>",
          );
        },
      );
    },
    _addLink: function (link) {
      var nbLinks = this.getChildren().length;
      var recentLinkBox = new RecentLinkBox(this, link);
      recentLinkBox.prependTo(this.$el);
      $(".link-tooltip").tooltip();
      if (nbLinks === 0) {
        this._updateNotification();
      }
    },
    removeLinks: function () {
      _.invoke(this.getChildren(), "destroy");
    },
    _updateNotification: function () {
      if (this.getChildren().length === 0) {
        var message = _t("You don't have any recent links.");
        $(".o_website_links_recent_links_notification").html(
          '<div class="alert alert-info">' + message + "</div>",
        );
      } else {
        $(".o_website_links_recent_links_notification").empty();
      }
    },
  });
  publicWidget.registry.websiteLinks = publicWidget.Widget.extend({
    selector: ".o_website_links_create_tracked_url",
    events: {
      "click #filter-newest-links": "_onFilterNewestLinksClick",
      "click #filter-most-clicked-links": "_onFilterMostClickedLinksClick",
      "click #filter-recently-used-links": "_onFilterRecentlyUsedLinksClick",
      "click #generated_tracked_link a": "_onGeneratedTrackedLinkClick",
      "keyup #url": "_onUrlKeyUp",
      "click #btn_shorten_url": "_onShortenUrlButtonClick",
      "submit #o_website_links_link_tracker_form": "_onFormSubmit",
    },
    start: function () {
      var defs = [this._super.apply(this, arguments)];
      var campaignSelect = new SelectBox(
        this,
        "utm.campaign",
        _t("e.g. Promotion of June, Winter Newsletter, .."),
      );
      defs.push(campaignSelect.attachTo($("#campaign-select")));
      var mediumSelect = new SelectBox(
        this,
        "utm.medium",
        _t("e.g. Newsletter, Social Network, .."),
      );
      defs.push(mediumSelect.attachTo($("#channel-select")));
      var sourceSelect = new SelectBox(
        this,
        "utm.source",
        _t("e.g. Search Engine, Website page, .."),
      );
      defs.push(sourceSelect.attachTo($("#source-select")));
      this.recentLinks = new RecentLinks(this);
      defs.push(this.recentLinks.appendTo($("#o_website_links_recent_links")));
      this.recentLinks.getRecentLinks("newest");
      new ClipboardJS($("#btn_shorten_url").get(0));
      this.url_copy_animating = false;
      $('[data-toggle="tooltip"]').tooltip();
      return Promise.all(defs);
    },
    _onFilterNewestLinksClick: function () {
      this.recentLinks.removeLinks();
      this.recentLinks.getRecentLinks("newest");
    },
    _onFilterMostClickedLinksClick: function () {
      this.recentLinks.removeLinks();
      this.recentLinks.getRecentLinks("most-clicked");
    },
    _onFilterRecentlyUsedLinksClick: function () {
      this.recentLinks.removeLinks();
      this.recentLinks.getRecentLinks("recently-used");
    },
    _onGeneratedTrackedLinkClick: function () {
      $("#generated_tracked_link a")
        .text(_t("Copied"))
        .removeClass("btn-primary")
        .addClass("btn-success");
      setTimeout(function () {
        $("#generated_tracked_link a")
          .text(_t("Copy"))
          .removeClass("btn-success")
          .addClass("btn-primary");
      }, 5000);
    },
    _onUrlKeyUp: function (ev) {
      if (!$("#btn_shorten_url").hasClass("btn-copy") || ev.which === 13) {
        return;
      }
      $("#btn_shorten_url")
        .removeClass("btn-success btn-copy")
        .addClass("btn-primary")
        .html("Get tracked link");
      $("#generated_tracked_link").css("display", "none");
      $(".o_website_links_utm_forms").show();
    },
    _onShortenUrlButtonClick: function () {
      if (
        !$("#btn_shorten_url").hasClass("btn-copy") ||
        this.url_copy_animating
      ) {
        return;
      }
      var self = this;
      this.url_copy_animating = true;
      $("#generated_tracked_link")
        .clone()
        .css("position", "absolute")
        .css("left", "78px")
        .css("bottom", "8px")
        .css("z-index", 2)
        .removeClass("#generated_tracked_link")
        .addClass("url-animated-link")
        .appendTo($("#generated_tracked_link"))
        .animate({ opacity: 0, bottom: "+=20" }, 500, function () {
          $(".url-animated-link").remove();
          self.url_copy_animating = false;
        });
    },
    _onFormSubmit: function (ev) {
      var self = this;
      ev.preventDefault();
      if ($("#btn_shorten_url").hasClass("btn-copy")) {
        return;
      }
      ev.stopPropagation();
      var campaignID = $("#campaign-select").attr("value");
      var mediumID = $("#channel-select").attr("value");
      var sourceID = $("#source-select").attr("value");
      var params = {};
      params.url = $("#url").val();
      if (campaignID !== "") {
        params.campaign_id = parseInt(campaignID);
      }
      if (mediumID !== "") {
        params.medium_id = parseInt(mediumID);
      }
      if (sourceID !== "") {
        params.source_id = parseInt(sourceID);
      }
      $("#btn_shorten_url").text(_t("Generating link..."));
      this._rpc({ route: "/website_links/new", params: params }).then(
        function (result) {
          if ("error" in result) {
            if (result.error === "empty_url") {
              $(".notification").html(
                '<div class="alert alert-danger">The URL is empty.</div>',
              );
            } else if (result.error === "url_not_found") {
              $(".notification").html(
                '<div class="alert alert-danger">URL not found (404)</div>',
              );
            } else {
              $(".notification").html(
                '<div class="alert alert-danger">An error occur while trying to generate your link. Try again later.</div>',
              );
            }
          } else {
            var link = result[0];
            $("#btn_shorten_url")
              .removeClass("btn-primary")
              .addClass("btn-success btn-copy")
              .html("Copy");
            $("#btn_shorten_url").attr("data-clipboard-text", link.short_url);
            $(".notification").html("");
            $("#generated_tracked_link").html(link.short_url);
            $("#generated_tracked_link").css("display", "inline");
            self.recentLinks._addLink(link);
            $("#campaign-select").select2("val", "");
            $("#channel-select").select2("val", "");
            $("#source-select").select2("val", "");
            $(".o_website_links_utm_forms").hide();
          }
        },
      );
    },
  });
  return {
    SelectBox: SelectBox,
    RecentLinkBox: RecentLinkBox,
    RecentLinks: RecentLinks,
  };
});

/* /website_links/static/src/js/website_links_code_editor.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_links.code_editor", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  publicWidget.registry.websiteLinksCodeEditor = publicWidget.Widget.extend({
    selector: "#wrapwrap:has(.o_website_links_edit_code)",
    events: {
      "click .o_website_links_edit_code": "_onEditCodeClick",
      "click .o_website_links_cancel_edit": "_onCancelEditClick",
      "submit #edit-code-form": "_onEditCodeFormSubmit",
      "click .o_website_links_ok_edit": "_onEditCodeFormSubmit",
    },
    _showNewCode: function (newCode) {
      $(".o_website_links_code_error").html("");
      $(".o_website_links_code_error").hide();
      $("#o_website_links_code form").remove();
      var host = $("#short-url-host").html();
      $("#o_website_links_code").html(newCode);
      $(".copy-to-clipboard").attr("data-clipboard-text", host + newCode);
      $(".o_website_links_edit_code").show();
      $(".copy-to-clipboard").show();
      $(".o_website_links_edit_tools").hide();
    },
    _submitCode: function () {
      var initCode = $("#edit-code-form #init_code").val();
      var newCode = $("#edit-code-form #new_code").val();
      var self = this;
      if (newCode === "") {
        self
          .$(".o_website_links_code_error")
          .html(_t("The code cannot be left empty"));
        self.$(".o_website_links_code_error").show();
        return;
      }
      this._showNewCode(newCode);
      if (initCode === newCode) {
        this._showNewCode(newCode);
      } else {
        return this._rpc({
          route: "/website_links/add_code",
          params: { init_code: initCode, new_code: newCode },
        }).then(
          function (result) {
            self._showNewCode(result[0].code);
          },
          function () {
            $(".o_website_links_code_error").show();
            $(".o_website_links_code_error").html(
              _t("This code is already taken"),
            );
          },
        );
      }
      return Promise.resolve();
    },
    _onEditCodeClick: function () {
      var initCode = $("#o_website_links_code").html();
      $("#o_website_links_code").html(
        '<form style="display:inline;" id="edit-code-form"><input type="hidden" id="init_code" value="' +
          initCode +
          '"/><input type="text" id="new_code" value="' +
          initCode +
          '"/></form>',
      );
      $(".o_website_links_edit_code").hide();
      $(".copy-to-clipboard").hide();
      $(".o_website_links_edit_tools").show();
    },
    _onCancelEditClick: function (ev) {
      ev.preventDefault();
      $(".o_website_links_edit_code").show();
      $(".copy-to-clipboard").show();
      $(".o_website_links_edit_tools").hide();
      $(".o_website_links_code_error").hide();
      var oldCode = $("#edit-code-form #init_code").val();
      $("#o_website_links_code").html(oldCode);
      $("#code-error").remove();
      $("#o_website_links_code form").remove();
    },
    _onEditCodeFormSubmit: function (ev) {
      ev.preventDefault();
      this._submitCode();
    },
  });
});

/* /website_links/static/src/js/website_links_charts.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("website_links.charts", function (require) {
  "use strict";
  var core = require("web.core");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  var BarChart = publicWidget.Widget.extend({
    jsLibs: ["/web/static/lib/Chart/Chart.js"],
    init: function (parent, beginDate, endDate, dates) {
      this._super.apply(this, arguments);
      this.beginDate = beginDate;
      this.endDate = endDate;
      this.number_of_days = this.endDate.diff(this.beginDate, "days") + 2;
      this.dates = dates;
    },
    start: function () {
      var clicksArray = [];
      var beginDateCopy = this.beginDate;
      for (var i = 0; i < this.number_of_days; i++) {
        var dateKey = beginDateCopy.format("YYYY-MM-DD");
        clicksArray.push([
          dateKey,
          dateKey in this.dates ? this.dates[dateKey] : 0,
        ]);
        beginDateCopy.add(1, "days");
      }
      var nbClicks = 0;
      var data = [];
      var labels = [];
      clicksArray.forEach(function (pt) {
        labels.push(pt[0]);
        nbClicks += pt[1];
        data.push(pt[1]);
      });
      this.$(".title").html(nbClicks + _t(" clicks"));
      var config = {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              fill: "start",
              label: _t("# of clicks"),
              backgroundColor: "#ebf2f7",
              borderColor: "#6aa1ca",
            },
          ],
        },
      };
      var canvas = this.$("canvas")[0];
      var context = canvas.getContext("2d");
      new Chart(context, config);
    },
  });
  var PieChart = publicWidget.Widget.extend({
    jsLibs: ["/web/static/lib/Chart/Chart.js"],
    init: function (parent, data) {
      this._super.apply(this, arguments);
      this.data = data;
    },
    start: function () {
      var labels = [];
      var data = [];
      for (var i = 0; i < this.data.length; i++) {
        var countryName = this.data[i]["country_id"]
          ? this.data[i]["country_id"][1]
          : _t("Undefined");
        labels.push(
          countryName + " (" + this.data[i]["country_id_count"] + ")",
        );
        data.push(this.data[i]["country_id_count"]);
      }
      this.$(".title").html(this.data.length + _t(" countries"));
      var config = {
        type: "pie",
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              label: this.data.length > 0 ? this.data[0].key : _t("No data"),
            },
          ],
        },
      };
      var canvas = this.$("canvas")[0];
      var context = canvas.getContext("2d");
      new Chart(context, config);
    },
  });
  publicWidget.registry.websiteLinksCharts = publicWidget.Widget.extend({
    selector: ".o_website_links_chart",
    events: {
      "click .graph-tabs li a": "_onGraphTabClick",
      "click .copy-to-clipboard": "_onCopyToClipboardClick",
    },
    start: function () {
      var self = this;
      this.charts = {};
      var linkID = parseInt($("#link_id").val());
      this.links_domain = ["link_id", "=", linkID];
      var defs = [];
      defs.push(this._totalClicks());
      defs.push(this._clicksByDay());
      defs.push(this._clicksByCountry());
      defs.push(this._lastWeekClicksByCountry());
      defs.push(this._lastMonthClicksByCountry());
      defs.push(this._super.apply(this, arguments));
      new ClipboardJS($(".copy-to-clipboard")[0]);
      this.animating_copy = false;
      return Promise.all(defs).then(function (results) {
        var _totalClicks = results[0];
        var _clicksByDay = results[1];
        var _clicksByCountry = results[2];
        var _lastWeekClicksByCountry = results[3];
        var _lastMonthClicksByCountry = results[4];
        if (!_totalClicks) {
          $("#all_time_charts").prepend(_t("There is no data to show"));
          $("#last_month_charts").prepend(_t("There is no data to show"));
          $("#last_week_charts").prepend(_t("There is no data to show"));
          return;
        }
        var formattedClicksByDay = {};
        var beginDate;
        for (var i = 0; i < _clicksByDay.length; i++) {
          var date = moment(_clicksByDay[i]["create_date:day"], "DD MMMM YYYY");
          if (i === 0) {
            beginDate = date;
          }
          formattedClicksByDay[date.format("YYYY-MM-DD")] =
            _clicksByDay[i]["create_date_count"];
        }
        var now = moment();
        self.charts.all_time_bar = new BarChart(
          self,
          beginDate,
          now,
          formattedClicksByDay,
        );
        self.charts.all_time_bar.attachTo($("#all_time_clicks_chart"));
        beginDate = moment().subtract(30, "days");
        self.charts.last_month_bar = new BarChart(
          self,
          beginDate,
          now,
          formattedClicksByDay,
        );
        self.charts.last_month_bar.attachTo($("#last_month_clicks_chart"));
        beginDate = moment().subtract(7, "days");
        self.charts.last_week_bar = new BarChart(
          self,
          beginDate,
          now,
          formattedClicksByDay,
        );
        self.charts.last_week_bar.attachTo($("#last_week_clicks_chart"));
        self.charts.all_time_pie = new PieChart(self, _clicksByCountry);
        self.charts.all_time_pie.attachTo($("#all_time_countries_charts"));
        self.charts.last_month_pie = new PieChart(
          self,
          _lastMonthClicksByCountry,
        );
        self.charts.last_month_pie.attachTo($("#last_month_countries_charts"));
        self.charts.last_week_pie = new PieChart(
          self,
          _lastWeekClicksByCountry,
        );
        self.charts.last_week_pie.attachTo($("#last_week_countries_charts"));
        var rowWidth = $("#all_time_countries_charts").parent().width();
        var $chartCanvas = $(
          "#all_time_countries_charts,last_month_countries_charts,last_week_countries_charts",
        ).find("canvas");
        $chartCanvas.height(
          Math.max(_clicksByCountry.length * (rowWidth > 750 ? 1 : 2), 20) +
            "em",
        );
      });
    },
    _totalClicks: function () {
      return this._rpc({
        model: "link.tracker.click",
        method: "search_count",
        args: [[this.links_domain]],
      });
    },
    _clicksByDay: function () {
      return this._rpc({
        model: "link.tracker.click",
        method: "read_group",
        args: [[this.links_domain], ["create_date"]],
        kwargs: { groupby: "create_date:day" },
      });
    },
    _clicksByCountry: function () {
      return this._rpc({
        model: "link.tracker.click",
        method: "read_group",
        args: [[this.links_domain], ["country_id"]],
        kwargs: { groupby: "country_id" },
      });
    },
    _lastWeekClicksByCountry: function () {
      var interval = moment().subtract(7, "days").format("YYYY-MM-DD");
      return this._rpc({
        model: "link.tracker.click",
        method: "read_group",
        args: [
          [this.links_domain, ["create_date", ">", interval]],
          ["country_id"],
        ],
        kwargs: { groupby: "country_id" },
      });
    },
    _lastMonthClicksByCountry: function () {
      var interval = moment().subtract(30, "days").format("YYYY-MM-DD");
      return this._rpc({
        model: "link.tracker.click",
        method: "read_group",
        args: [
          [this.links_domain, ["create_date", ">", interval]],
          ["country_id"],
        ],
        kwargs: { groupby: "country_id" },
      });
    },
    _onGraphTabClick: function (ev) {
      ev.preventDefault();
      $(".graph-tabs li a").tab("show");
    },
    _onCopyToClipboardClick: function (ev) {
      ev.preventDefault();
      if (this.animating_copy) {
        return;
      }
      this.animating_copy = true;
      $(".o_website_links_short_url")
        .clone()
        .css("position", "absolute")
        .css("left", "15px")
        .css("bottom", "10px")
        .css("z-index", 2)
        .removeClass(".o_website_links_short_url")
        .addClass("animated-link")
        .appendTo($(".o_website_links_short_url"))
        .animate({ opacity: 0, bottom: "+=20" }, 500, function () {
          $(".animated-link").remove();
          this.animating_copy = false;
        });
    },
  });
  return { BarChart: BarChart, PieChart: PieChart };
});

/* /website_rating/static/src/js/portal_chatter.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("rating.portal.chatter", function (require) {
  "use strict";
  var core = require("web.core");
  var portalChatter = require("portal.chatter");
  var utils = require("web.utils");
  var time = require("web.time");
  var _t = core._t;
  var PortalChatter = portalChatter.PortalChatter;
  var qweb = core.qweb;
  var STAR_RATING_RATIO = 2;
  PortalChatter.include({
    events: _.extend({}, PortalChatter.prototype.events, {
      "click .o_website_rating_select": "_onClickStarDomain",
      "click .o_website_rating_select_text": "_onClickStarDomainReset",
      "click .o_wrating_js_publisher_comment_btn": "_onClickPublisherComment",
      "click .o_wrating_js_publisher_comment_edit": "_onClickPublisherComment",
      "click .o_wrating_js_publisher_comment_delete":
        "_onClickPublisherCommentDelete",
      "click .o_wrating_js_publisher_comment_submit":
        "_onClickPublisherCommentSubmit",
      "click .o_wrating_js_publisher_comment_cancel":
        "_onClickPublisherCommentCancel",
    }),
    xmlDependencies: (PortalChatter.prototype.xmlDependencies || []).concat([
      "/website_rating/static/src/xml/portal_tools.xml",
      "/website_rating/static/src/xml/portal_chatter.xml",
    ]),
    init: function (parent, options) {
      this._super.apply(this, arguments);
      if (!_.contains(this.options, "display_rating")) {
        this.options = _.defaults(this.options, {
          display_rating: false,
          rating_default_value: 0.0,
        });
      }
      this.set("rating_card_values", {});
      this.set("rating_value", false);
      this.on("change:rating_value", this, this._onChangeRatingDomain);
    },
    preprocessMessages: function (messages) {
      var self = this;
      messages = this._super.apply(this, arguments);
      if (this.options["display_rating"]) {
        _.each(messages, function (m, i) {
          m.rating_value = self.roundToHalf(
            m["rating_value"] / STAR_RATING_RATIO,
          );
          m.rating = self._preprocessCommentData(m.rating, i);
        });
      }
      this.messages = messages;
      return messages;
    },
    roundToHalf: function (value) {
      var converted = parseFloat(value);
      var decimal = converted - parseInt(converted, 10);
      decimal = Math.round(decimal * 10);
      if (decimal === 5) {
        return parseInt(converted, 10) + 0.5;
      }
      if (decimal < 3 || decimal > 7) {
        return Math.round(converted);
      } else {
        return parseInt(converted, 10) + 0.5;
      }
    },
    _chatterInit: function () {
      var self = this;
      return this._super.apply(this, arguments).then(function (result) {
        if (!result["rating_stats"]) {
          return;
        }
        var ratingData = {
          avg:
            Math.round(
              (result["rating_stats"]["avg"] / STAR_RATING_RATIO) * 100,
            ) / 100,
          percent: [],
        };
        _.each(
          _.keys(result["rating_stats"]["percent"]).reverse(),
          function (rating) {
            if (rating % 2 === 0) {
              ratingData["percent"].push({
                num: rating / STAR_RATING_RATIO,
                percent: utils.round_precision(
                  result["rating_stats"]["percent"][rating],
                  0.01,
                ),
              });
            }
          },
        );
        self.set("rating_card_values", ratingData);
      });
    },
    _messageFetchPrepareParams: function () {
      var params = this._super.apply(this, arguments);
      if (this.options["display_rating"]) {
        params["rating_include"] = true;
      }
      return params;
    },
    _newPublisherCommentData: function (messageIndex) {
      return {
        mes_index: messageIndex,
        publisher_id: this.options.partner_id,
        publisher_avatar: _.str.sprintf(
          "/web/image/%s/%s/image_128/50x50",
          "res.partner",
          this.options.partner_id,
        ),
        publisher_name: _t("Write your comment"),
        publisher_datetime: "",
        publisher_comment: "",
      };
    },
    _preprocessCommentData: function (rawRating, messageIndex) {
      var ratingData = {
        id: rawRating.id,
        mes_index: messageIndex,
        publisher_datetime: rawRating.publisher_datetime
          ? moment(time.str_to_datetime(rawRating.publisher_datetime)).format(
              "MMMM Do YYYY, h:mm:ss a",
            )
          : "",
        publisher_comment: rawRating.publisher_comment
          ? rawRating.publisher_comment
          : "",
      };
      if (rawRating.publisher_id && rawRating.publisher_id.length >= 2) {
        ratingData.publisher_id = rawRating.publisher_id[0];
        ratingData.publisher_name = rawRating.publisher_id[1];
        ratingData.publisher_avatar = _.str.sprintf(
          "/web/image/%s/%s/image_128/50x50",
          "res.partner",
          ratingData.publisher_id,
        );
      }
      var commentData = _.extend(
        this._newPublisherCommentData(messageIndex),
        ratingData,
      );
      return commentData;
    },
    _getCommentContainer: function ($source) {
      return $source
        .parents(".o_wrating_publisher_container")
        .first()
        .find(".o_wrating_publisher_comment")
        .first();
    },
    _getCommentButton: function ($source) {
      return $source
        .parents(".o_wrating_publisher_container")
        .first()
        .find(".o_wrating_js_publisher_comment_btn")
        .first();
    },
    _getCommentTextarea: function ($source) {
      return $source
        .parents(".o_wrating_publisher_container")
        .first()
        .find(".o_portal_rating_comment_input")
        .first();
    },
    _focusTextComment: function ($source) {
      this._getCommentTextarea($source).focus();
    },
    _onClickStarDomain: function (ev) {
      var $tr = this.$(ev.currentTarget);
      var num = $tr.data("star");
      if ($tr.css("opacity") === "1") {
        this.set("rating_value", num);
        this.$(".o_website_rating_select").css({ opacity: 0.5 });
        this.$('.o_website_rating_select_text[data-star="' + num + '"]').css({
          visibility: "visible",
          opacity: 1,
        });
        this.$('.o_website_rating_select[data-star="' + num + '"]').css({
          opacity: 1,
        });
      }
    },
    _onClickStarDomainReset: function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      this.set("rating_value", false);
      this.$(".o_website_rating_select_text").css("visibility", "hidden");
      this.$(".o_website_rating_select").css({ opacity: 1 });
    },
    _onClickPublisherComment: function (ev) {
      var $source = this.$(ev.currentTarget);
      if (this._getCommentTextarea($source).length === 1) {
        this._getCommentContainer($source).empty();
        return;
      }
      var messageIndex = $source.data("mes_index");
      var data = { is_publisher: this.options["is_user_publisher"] };
      data.rating = this._newPublisherCommentData(messageIndex);
      var oldRating = this.messages[messageIndex].rating;
      data.rating.publisher_comment = oldRating.publisher_comment
        ? oldRating.publisher_comment
        : "";
      this._getCommentContainer($source).html(
        $(qweb.render("website_rating.chatter_rating_publisher_form", data)),
      );
      this._focusTextComment($source);
    },
    _onClickPublisherCommentDelete: function (ev) {
      var self = this;
      var $source = this.$(ev.currentTarget);
      var messageIndex = $source.data("mes_index");
      var ratingId = this.messages[messageIndex].rating.id;
      this._rpc({
        route: "/website/rating/comment",
        params: { rating_id: ratingId, publisher_comment: "" },
      }).then(function (res) {
        self.messages[messageIndex].rating = self._preprocessCommentData(
          res,
          messageIndex,
        );
        self._getCommentButton($source).removeClass("d-none");
        self._getCommentContainer($source).empty();
      });
    },
    _onClickPublisherCommentSubmit: function (ev) {
      var self = this;
      var $source = this.$(ev.currentTarget);
      var messageIndex = $source.data("mes_index");
      var comment = this._getCommentTextarea($source).val();
      var ratingId = this.messages[messageIndex].rating.id;
      this._rpc({
        route: "/website/rating/comment",
        params: { rating_id: ratingId, publisher_comment: comment },
      }).then(function (res) {
        self.messages[messageIndex].rating = self._preprocessCommentData(
          res,
          messageIndex,
        );
        if (self.messages[messageIndex].rating.publisher_comment !== "") {
          self._getCommentButton($source).addClass("d-none");
          self._getCommentContainer($source).html(
            $(
              qweb.render("website_rating.chatter_rating_publisher_comment", {
                rating: self.messages[messageIndex].rating,
                is_publisher: self.options.is_user_publisher,
              }),
            ),
          );
        } else {
          self._getCommentButton($source).removeClass("d-none");
          self._getCommentContainer($source).empty();
        }
      });
    },
    _onClickPublisherCommentCancel: function (ev) {
      var $source = this.$(ev.currentTarget);
      var messageIndex = $source.data("mes_index");
      var comment = this.messages[messageIndex].rating.publisher_comment;
      if (comment) {
        var data = {
          rating: this.messages[messageIndex].rating,
          is_publisher: this.options.is_user_publisher,
        };
        this._getCommentContainer($source).html(
          $(
            qweb.render(
              "website_rating.chatter_rating_publisher_comment",
              data,
            ),
          ),
        );
      } else {
        this._getCommentContainer($source).empty();
      }
    },
    _onChangeRatingDomain: function () {
      var domain = [];
      if (this.get("rating_value")) {
        domain = [
          ["rating_value", "=", this.get("rating_value") * STAR_RATING_RATIO],
        ];
      }
      this._changeCurrentPage(1, domain);
    },
  });
});

/* /website_rating/static/src/js/portal_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("rating.portal.composer", function (require) {
  "use strict";
  var core = require("web.core");
  var portalComposer = require("portal.composer");
  var _t = core._t;
  var PortalComposer = portalComposer.PortalComposer;
  var STAR_RATING_RATIO = 2;
  PortalComposer.include({
    events: _.extend({}, PortalComposer.prototype.events, {
      "click .stars i": "_onClickStar",
      "mouseleave .stars": "_onMouseleaveStarBlock",
      "mousemove .stars i": "_onMoveStar",
      "mouseleave .stars i": "_onMoveLeaveStar",
    }),
    init: function (parent, options) {
      this._super.apply(this, arguments);
      if (options.default_rating_value) {
        options.default_rating_value =
          parseFloat(options.default_rating_value) / STAR_RATING_RATIO;
      }
      this.options = _.defaults(this.options, {
        default_message: false,
        default_message_id: false,
        default_rating_value: false,
        force_submit_url: false,
      });
      this.labels = {
        0: "",
        1: _t("I hate it"),
        2: _t("I don't like it"),
        3: _t("It's okay"),
        4: _t("I like it"),
        5: _t("I love it"),
      };
      this.user_click = false;
      this.set("star_value", this.options.default_rating_value);
      this.on("change:star_value", this, this._onChangeStarValue);
    },
    start: function () {
      var self = this;
      return this._super.apply(this, arguments).then(function () {
        self.$input = self.$('input[name="rating_value"]');
        self.$star_list = self.$(".stars").find("i");
        self.set("star_value", self.options.default_rating_value);
        self.$input.val(self.options.default_rating_value * STAR_RATING_RATIO);
      });
    },
    _onChangeStarValue: function () {
      var val = this.get("star_value");
      var index = Math.floor(val);
      var decimal = val - index;
      this.$star_list
        .removeClass("fa-star fa-star-half-o")
        .addClass("fa-star-o");
      this.$(".stars")
        .find("i:lt(" + index + ")")
        .removeClass("fa-star-o fa-star-half-o")
        .addClass("fa-star");
      if (decimal) {
        this.$(".stars")
          .find("i:eq(" + index + ")")
          .removeClass("fa-star-o fa-star fa-star-half-o")
          .addClass("fa-star-half-o");
      }
      this.$(".rate_text .badge").text(this.labels[index]);
    },
    _onClickStar: function (ev) {
      var index = this.$(".stars i").index(ev.currentTarget);
      this.set("star_value", index + 1);
      this.user_click = true;
      this.$input.val(this.get("star_value") * STAR_RATING_RATIO);
    },
    _onMouseleaveStarBlock: function () {
      this.$(".rate_text").hide();
    },
    _onMoveStar: function (ev) {
      var index = this.$(".stars i").index(ev.currentTarget);
      this.$(".rate_text").show();
      this.set("star_value", index + 1);
    },
    _onMoveLeaveStar: function () {
      if (!this.user_click) {
        this.set("star_value", parseInt(this.$input.val()));
      }
      this.user_click = false;
    },
  });
});

/* /website_rating/static/src/js/portal_rating_composer.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("portal.rating.composer", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var session = require("web.session");
  var portalComposer = require("portal.composer");
  var PortalComposer = portalComposer.PortalComposer;
  var STAR_RATING_RATIO = 2;
  var RatingPopupComposer = publicWidget.Widget.extend({
    template: "website_rating.PopupComposer",
    xmlDependencies: [
      "/portal/static/src/xml/portal_chatter.xml",
      "/website_rating/static/src/xml/portal_tools.xml",
      "/website_rating/static/src/xml/portal_rating_composer.xml",
    ],
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.rating_avg =
        Math.round((options["ratingAvg"] / STAR_RATING_RATIO) * 100) / 100 ||
        0.0;
      this.rating_total = options["ratingTotal"] || 0.0;
      this.options = _.defaults({}, options, {
        token: false,
        res_model: false,
        res_id: false,
        pid: 0,
        display_composer: options["disable_composer"]
          ? false
          : !session.is_website_user,
        display_rating: true,
        csrf_token: odoo.csrf_token,
        user_id: session.user_id,
      });
    },
    start: function () {
      var defs = [];
      defs.push(this._super.apply(this, arguments));
      this._composer = new PortalComposer(this, this.options);
      defs.push(this._composer.replace(this.$(".o_portal_chatter_composer")));
      return Promise.all(defs);
    },
  });
  publicWidget.registry.RatingPopupComposer = publicWidget.Widget.extend({
    selector: ".o_rating_popup_composer",
    start: function () {
      var ratingPopupData = this.$el.data();
      var ratingPopup = new RatingPopupComposer(this, ratingPopupData);
      return Promise.all([
        this._super.apply(this, arguments),
        ratingPopup.appendTo(this.$el),
      ]);
    },
  });
  return RatingPopupComposer;
});

/* /web_tour/static/src/js/public/tour_manager.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("web_tour.public.TourManager", function (require) {
  "use strict";
  var TourManager = require("web_tour.TourManager");
  var lazyloader = require("web.public.lazyloader");
  TourManager.include({
    _waitBeforeTourStart: function () {
      return this._super
        .apply(this, arguments)
        .then(function () {
          return lazyloader.allScriptsLoaded;
        })
        .then(function () {
          return new Promise(function (resolve) {
            setTimeout(resolve);
          });
        });
    },
  });
});

/* /auth_signup/static/src/js/signup.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("auth_signup.signup", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.SignUpForm = publicWidget.Widget.extend({
    selector: ".oe_signup_form",
    events: { submit: "_onSubmit" },
    _onSubmit: function () {
      var $btn = this.$('.oe_login_buttons > button[type="submit"]');
      $btn.attr("disabled", "disabled");
      $btn.prepend('<i class="fa fa-refresh fa-spin"/> ');
    },
  });
});

/* /account/static/src/js/account_portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("account.AccountPortalSidebar", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var PortalSidebar = require("portal.PortalSidebar");
  var utils = require("web.utils");
  publicWidget.registry.AccountPortalSidebar = PortalSidebar.extend({
    selector: ".o_portal_invoice_sidebar",
    events: { "click .o_portal_invoice_print": "_onPrintInvoice" },
    start: function () {
      var def = this._super.apply(this, arguments);
      var $invoiceHtml = this.$el.find("iframe#invoice_html");
      var updateIframeSize = this._updateIframeSize.bind(this, $invoiceHtml);
      $(window).on("resize", updateIframeSize);
      var iframeDoc =
        $invoiceHtml[0].contentDocument ||
        $invoiceHtml[0].contentWindow.document;
      if (iframeDoc.readyState === "complete") {
        updateIframeSize();
      } else {
        $invoiceHtml.on("load", updateIframeSize);
      }
      return def;
    },
    _updateIframeSize: function ($el) {
      var $wrapwrap = $el.contents().find("div#wrapwrap");
      $el.height(0);
      $el.height($wrapwrap[0].scrollHeight);
      if (!utils.isValidAnchor(window.location.hash)) {
        return;
      }
      var $target = $(window.location.hash);
      if (!$target.length) {
        return;
      }
      $("html, body").scrollTop($target.offset().top);
    },
    _onPrintInvoice: function (ev) {
      ev.preventDefault();
      var href = $(ev.currentTarget).attr("href");
      this._printIframeContent(href);
    },
  });
});

/* /payment/static/lib/jquery.payment/jquery.payment.js defined in bundle 'web.assets_frontend_lazy' */
(function () {
  var $,
    cardFromNumber,
    cardFromType,
    cards,
    defaultFormat,
    formatBackCardNumber,
    formatBackExpiry,
    formatCardNumber,
    formatExpiry,
    formatForwardExpiry,
    formatForwardSlashAndSpace,
    hasTextSelected,
    luhnCheck,
    reFormatCVC,
    reFormatCardNumber,
    reFormatExpiry,
    reFormatNumeric,
    replaceFullWidthChars,
    restrictCVC,
    restrictCardNumber,
    restrictExpiry,
    restrictNumeric,
    safeVal,
    setCardType,
    __slice = [].slice,
    __indexOf =
      [].indexOf ||
      function (item) {
        for (var i = 0, l = this.length; i < l; i++) {
          if (i in this && this[i] === item) return i;
        }
        return -1;
      };
  $ = window.jQuery || window.Zepto || window.$;
  $.payment = {};
  $.payment.fn = {};
  $.fn.payment = function () {
    var args, method;
    ((method = arguments[0]),
      (args = 2 <= arguments.length ? __slice.call(arguments, 1) : []));
    return $.payment.fn[method].apply(this, args);
  };
  defaultFormat = /(\d{1,4})/g;
  $.payment.cards = cards = [
    {
      type: "maestro",
      patterns: [5018, 502, 503, 506, 56, 58, 639, 6220, 67],
      format: defaultFormat,
      length: [12, 13, 14, 15, 16, 17, 18, 19],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "forbrugsforeningen",
      patterns: [600],
      format: defaultFormat,
      length: [16],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "dankort",
      patterns: [5019],
      format: defaultFormat,
      length: [16],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "visa",
      patterns: [4],
      format: defaultFormat,
      length: [13, 16],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "mastercard",
      patterns: [51, 52, 53, 54, 55, 22, 23, 24, 25, 26, 27],
      format: defaultFormat,
      length: [16],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "amex",
      patterns: [34, 37],
      format: /(\d{1,4})(\d{1,6})?(\d{1,5})?/,
      length: [15],
      cvcLength: [3, 4],
      luhn: true,
    },
    {
      type: "dinersclub",
      patterns: [30, 36, 38, 39],
      format: /(\d{1,4})(\d{1,6})?(\d{1,4})?/,
      length: [14],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "discover",
      patterns: [60, 64, 65, 622],
      format: defaultFormat,
      length: [16],
      cvcLength: [3],
      luhn: true,
    },
    {
      type: "unionpay",
      patterns: [62, 88],
      format: defaultFormat,
      length: [16, 17, 18, 19],
      cvcLength: [3],
      luhn: false,
    },
    {
      type: "jcb",
      patterns: [35],
      format: defaultFormat,
      length: [16],
      cvcLength: [3],
      luhn: true,
    },
  ];
  cardFromNumber = function (num) {
    var card, p, pattern, _i, _j, _len, _len1, _ref;
    num = (num + "").replace(/\D/g, "");
    for (_i = 0, _len = cards.length; _i < _len; _i++) {
      card = cards[_i];
      _ref = card.patterns;
      for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
        pattern = _ref[_j];
        p = pattern + "";
        if (num.substr(0, p.length) === p) {
          return card;
        }
      }
    }
  };
  cardFromType = function (type) {
    var card, _i, _len;
    for (_i = 0, _len = cards.length; _i < _len; _i++) {
      card = cards[_i];
      if (card.type === type) {
        return card;
      }
    }
  };
  luhnCheck = function (num) {
    var digit, digits, odd, sum, _i, _len;
    odd = true;
    sum = 0;
    digits = (num + "").split("").reverse();
    for (_i = 0, _len = digits.length; _i < _len; _i++) {
      digit = digits[_i];
      digit = parseInt(digit, 10);
      if ((odd = !odd)) {
        digit *= 2;
      }
      if (digit > 9) {
        digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  };
  hasTextSelected = function ($target) {
    var _ref;
    if (
      $target.prop("selectionStart") != null &&
      $target.prop("selectionStart") !== $target.prop("selectionEnd")
    ) {
      return true;
    }
    if (
      (typeof document !== "undefined" && document !== null
        ? (_ref = document.selection) != null
          ? _ref.createRange
          : void 0
        : void 0) != null
    ) {
      if (document.selection.createRange().text) {
        return true;
      }
    }
    return false;
  };
  safeVal = function (value, $target) {
    var currPair, cursor, digit, error, last, prevPair;
    try {
      cursor = $target.prop("selectionStart");
    } catch (_error) {
      error = _error;
      cursor = null;
    }
    last = $target.val();
    $target.val(value);
    if (cursor !== null && $target.is(":focus")) {
      if (cursor === last.length) {
        cursor = value.length;
      }
      if (last !== value) {
        prevPair = last.slice(cursor - 1, +cursor + 1 || 9e9);
        currPair = value.slice(cursor - 1, +cursor + 1 || 9e9);
        digit = value[cursor];
        if (
          /\d/.test(digit) &&
          prevPair === "" + digit + " " &&
          currPair === " " + digit
        ) {
          cursor = cursor + 1;
        }
      }
      $target.prop("selectionStart", cursor);
      return $target.prop("selectionEnd", cursor);
    }
  };
  replaceFullWidthChars = function (str) {
    var chars, chr, fullWidth, halfWidth, idx, value, _i, _len;
    if (str == null) {
      str = "";
    }
    fullWidth = "\uff10\uff11\uff12\uff13\uff14\uff15\uff16\uff17\uff18\uff19";
    halfWidth = "0123456789";
    value = "";
    chars = str.split("");
    for (_i = 0, _len = chars.length; _i < _len; _i++) {
      chr = chars[_i];
      idx = fullWidth.indexOf(chr);
      if (idx > -1) {
        chr = halfWidth[idx];
      }
      value += chr;
    }
    return value;
  };
  reFormatNumeric = function (e) {
    var $target;
    $target = $(e.currentTarget);
    return setTimeout(function () {
      var value;
      value = $target.val();
      value = replaceFullWidthChars(value);
      value = value.replace(/\D/g, "");
      return safeVal(value, $target);
    });
  };
  reFormatCardNumber = function (e) {
    var $target;
    $target = $(e.currentTarget);
    return setTimeout(function () {
      var value;
      value = $target.val();
      value = replaceFullWidthChars(value);
      value = $.payment.formatCardNumber(value);
      return safeVal(value, $target);
    });
  };
  formatCardNumber = function (e) {
    var $target, card, digit, length, re, upperLength, value;
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    $target = $(e.currentTarget);
    value = $target.val();
    card = cardFromNumber(value + digit);
    length = (value.replace(/\D/g, "") + digit).length;
    upperLength = 16;
    if (card) {
      upperLength = card.length[card.length.length - 1];
    }
    if (length >= upperLength) {
      return;
    }
    if (
      $target.prop("selectionStart") != null &&
      $target.prop("selectionStart") !== value.length
    ) {
      return;
    }
    if (card && card.type === "amex") {
      re = /^(\d{4}|\d{4}\s\d{6})$/;
    } else {
      re = /(?:^|\s)(\d{4})$/;
    }
    if (re.test(value)) {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val(value + " " + digit);
      });
    } else if (re.test(value + digit)) {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val(value + digit + " ");
      });
    }
  };
  formatBackCardNumber = function (e) {
    var $target, value;
    $target = $(e.currentTarget);
    value = $target.val();
    if (e.which !== 8) {
      return;
    }
    if (
      $target.prop("selectionStart") != null &&
      $target.prop("selectionStart") !== value.length
    ) {
      return;
    }
    if (/\d\s$/.test(value)) {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val(value.replace(/\d\s$/, ""));
      });
    } else if (/\s\d?$/.test(value)) {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val(value.replace(/\d$/, ""));
      });
    }
  };
  reFormatExpiry = function (e) {
    var $target;
    $target = $(e.currentTarget);
    return setTimeout(function () {
      var value;
      value = $target.val();
      value = replaceFullWidthChars(value);
      value = $.payment.formatExpiry(value);
      return safeVal(value, $target);
    });
  };
  formatExpiry = function (e) {
    var $target, digit, val;
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    $target = $(e.currentTarget);
    val = $target.val() + digit;
    if (/^\d$/.test(val) && val !== "0" && val !== "1") {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val("0" + val + " / ");
      });
    } else if (/^\d\d$/.test(val)) {
      e.preventDefault();
      return setTimeout(function () {
        var m1, m2;
        m1 = parseInt(val[0], 10);
        m2 = parseInt(val[1], 10);
        if (m2 > 2 && m1 !== 0) {
          return $target.val("0" + m1 + " / " + m2);
        } else {
          return $target.val("" + val + " / ");
        }
      });
    }
  };
  formatForwardExpiry = function (e) {
    var $target, digit, val;
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    $target = $(e.currentTarget);
    val = $target.val();
    if (/^\d\d$/.test(val)) {
      return $target.val("" + val + " / ");
    }
  };
  formatForwardSlashAndSpace = function (e) {
    var $target, val, which;
    which = String.fromCharCode(e.which);
    if (!(which === "/" || which === " ")) {
      return;
    }
    $target = $(e.currentTarget);
    val = $target.val();
    if (/^\d$/.test(val) && val !== "0") {
      return $target.val("0" + val + " / ");
    }
  };
  formatBackExpiry = function (e) {
    var $target, value;
    $target = $(e.currentTarget);
    value = $target.val();
    if (e.which !== 8) {
      return;
    }
    if (
      $target.prop("selectionStart") != null &&
      $target.prop("selectionStart") !== value.length
    ) {
      return;
    }
    if (/\d\s\/\s$/.test(value)) {
      e.preventDefault();
      return setTimeout(function () {
        return $target.val(value.replace(/\d\s\/\s$/, ""));
      });
    }
  };
  reFormatCVC = function (e) {
    var $target;
    $target = $(e.currentTarget);
    return setTimeout(function () {
      var value;
      value = $target.val();
      value = replaceFullWidthChars(value);
      value = value.replace(/\D/g, "").slice(0, 4);
      return safeVal(value, $target);
    });
  };
  restrictNumeric = function (e) {
    var input;
    if (e.metaKey || e.ctrlKey) {
      return true;
    }
    if (e.which === 32) {
      return false;
    }
    if (e.which === 0) {
      return true;
    }
    if (e.which < 33) {
      return true;
    }
    input = String.fromCharCode(e.which);
    return !!/[\d\s]/.test(input);
  };
  restrictCardNumber = function (e) {
    var $target, card, digit, value;
    $target = $(e.currentTarget);
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    if (hasTextSelected($target)) {
      return;
    }
    value = ($target.val() + digit).replace(/\D/g, "");
    card = cardFromNumber(value);
    if (card) {
      return value.length <= card.length[card.length.length - 1];
    } else {
      return value.length <= 16;
    }
  };
  restrictExpiry = function (e) {
    var $target, digit, value;
    $target = $(e.currentTarget);
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    if (hasTextSelected($target)) {
      return;
    }
    value = $target.val() + digit;
    value = value.replace(/\D/g, "");
    if (value.length > 6) {
      return false;
    }
  };
  restrictCVC = function (e) {
    var $target, digit, val;
    $target = $(e.currentTarget);
    digit = String.fromCharCode(e.which);
    if (!/^\d+$/.test(digit)) {
      return;
    }
    if (hasTextSelected($target)) {
      return;
    }
    val = $target.val() + digit;
    return val.length <= 4;
  };
  setCardType = function (e) {
    var $target, allTypes, card, cardType, val;
    $target = $(e.currentTarget);
    val = $target.val();
    cardType = $.payment.cardType(val) || "unknown";
    if (!$target.hasClass(cardType)) {
      allTypes = (function () {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = cards.length; _i < _len; _i++) {
          card = cards[_i];
          _results.push(card.type);
        }
        return _results;
      })();
      $target.removeClass("unknown");
      $target.removeClass(allTypes.join(" "));
      $target.addClass(cardType);
      $target.toggleClass("identified", cardType !== "unknown");
      return $target.trigger("payment.cardType", cardType);
    }
  };
  $.payment.fn.formatCardCVC = function () {
    this.on("keypress", restrictNumeric);
    this.on("keypress", restrictCVC);
    this.on("paste", reFormatCVC);
    this.on("change", reFormatCVC);
    this.on("input", reFormatCVC);
    return this;
  };
  $.payment.fn.formatCardExpiry = function () {
    this.on("keypress", restrictNumeric);
    this.on("keypress", restrictExpiry);
    this.on("keypress", formatExpiry);
    this.on("keypress", formatForwardSlashAndSpace);
    this.on("keypress", formatForwardExpiry);
    this.on("keydown", formatBackExpiry);
    this.on("change", reFormatExpiry);
    this.on("input", reFormatExpiry);
    return this;
  };
  $.payment.fn.formatCardNumber = function () {
    this.on("keypress", restrictNumeric);
    this.on("keypress", restrictCardNumber);
    this.on("keypress", formatCardNumber);
    this.on("keydown", formatBackCardNumber);
    this.on("keyup", setCardType);
    this.on("paste", reFormatCardNumber);
    this.on("change", reFormatCardNumber);
    this.on("input", reFormatCardNumber);
    this.on("input", setCardType);
    return this;
  };
  $.payment.fn.restrictNumeric = function () {
    this.on("keypress", restrictNumeric);
    this.on("paste", reFormatNumeric);
    this.on("change", reFormatNumeric);
    this.on("input", reFormatNumeric);
    return this;
  };
  $.payment.fn.cardExpiryVal = function () {
    return $.payment.cardExpiryVal($(this).val());
  };
  $.payment.cardExpiryVal = function (value) {
    var month, prefix, year, _ref;
    ((_ref = value.split(/[\s\/]+/, 2)), (month = _ref[0]), (year = _ref[1]));
    if ((year != null ? year.length : void 0) === 2 && /^\d+$/.test(year)) {
      prefix = new Date().getFullYear();
      prefix = prefix.toString().slice(0, 2);
      year = prefix + year;
    }
    month = parseInt(month, 10);
    year = parseInt(year, 10);
    return { month: month, year: year };
  };
  $.payment.validateCardNumber = function (num) {
    var card, _ref;
    num = (num + "").replace(/\s+|-/g, "");
    if (!/^\d+$/.test(num)) {
      return false;
    }
    card = cardFromNumber(num);
    if (!card) {
      return false;
    }
    return (
      ((_ref = num.length), __indexOf.call(card.length, _ref) >= 0) &&
      (card.luhn === false || luhnCheck(num))
    );
  };
  $.payment.validateCardExpiry = function (month, year) {
    var currentTime, expiry, _ref;
    if (typeof month === "object" && "month" in month) {
      ((_ref = month), (month = _ref.month), (year = _ref.year));
    }
    if (!(month && year)) {
      return false;
    }
    month = $.trim(month);
    year = $.trim(year);
    if (!/^\d+$/.test(month)) {
      return false;
    }
    if (!/^\d+$/.test(year)) {
      return false;
    }
    if (!(1 <= month && month <= 12)) {
      return false;
    }
    if (year.length === 2) {
      if (year < 70) {
        year = "20" + year;
      } else {
        year = "19" + year;
      }
    }
    if (year.length !== 4) {
      return false;
    }
    expiry = new Date(year, month);
    currentTime = new Date();
    expiry.setMonth(expiry.getMonth() - 1);
    expiry.setMonth(expiry.getMonth() + 1, 1);
    return expiry > currentTime;
  };
  $.payment.validateCardCVC = function (cvc, type) {
    var card, _ref;
    cvc = $.trim(cvc);
    if (!/^\d+$/.test(cvc)) {
      return false;
    }
    card = cardFromType(type);
    if (card != null) {
      return ((_ref = cvc.length), __indexOf.call(card.cvcLength, _ref) >= 0);
    } else {
      return cvc.length >= 3 && cvc.length <= 4;
    }
  };
  $.payment.cardType = function (num) {
    var _ref;
    if (!num) {
      return null;
    }
    return ((_ref = cardFromNumber(num)) != null ? _ref.type : void 0) || null;
  };
  $.payment.formatCardNumber = function (num) {
    var card, groups, upperLength, _ref;
    num = num.replace(/\D/g, "");
    card = cardFromNumber(num);
    if (!card) {
      return num;
    }
    upperLength = card.length[card.length.length - 1];
    num = num.slice(0, upperLength);
    if (card.format.global) {
      return (_ref = num.match(card.format)) != null ? _ref.join(" ") : void 0;
    } else {
      groups = card.format.exec(num);
      if (groups == null) {
        return;
      }
      groups.shift();
      groups = $.grep(groups, function (n) {
        return n;
      });
      return groups.join(" ");
    }
  };
  $.payment.formatExpiry = function (expiry) {
    var mon, parts, sep, year;
    parts = expiry.match(/^\D*(\d{1,2})(\D+)?(\d{1,4})?/);
    if (!parts) {
      return "";
    }
    mon = parts[1] || "";
    sep = parts[2] || "";
    year = parts[3] || "";
    if (year.length > 0) {
      sep = " / ";
    } else if (sep === " /") {
      mon = mon.substring(0, 1);
      sep = "";
    } else if (mon.length === 2 || sep.length > 0) {
      sep = " / ";
    } else if (mon.length === 1 && mon !== "0" && mon !== "1") {
      mon = "0" + mon;
      sep = " / ";
    }
    return mon + sep + year;
  };
}).call(this);

/* /payment/static/src/js/payment_portal.js defined in bundle 'web.assets_frontend_lazy' */
$(function () {
  $("input#cc_number").payment("formatCardNumber");
  $("input#cc_cvc").payment("formatCardCVC");
  $("input#cc_expiry").payment("formatCardExpiry");
  $("input#cc_number").on("focusout", function (e) {
    var valid_value = $.payment.validateCardNumber(this.value);
    var card_type = $.payment.cardType(this.value);
    if (card_type) {
      $(this)
        .parent(".form-group")
        .children(".card_placeholder")
        .removeClass()
        .addClass("card_placeholder " + card_type);
      $(this)
        .parent(".form-group")
        .children('input[name="cc_brand"]')
        .val(card_type);
    } else {
      $(this)
        .parent(".form-group")
        .children(".card_placeholder")
        .removeClass()
        .addClass("card_placeholder");
    }
    if (valid_value) {
      $(this)
        .parent(".form-group")
        .addClass("o_has_success")
        .find(".form-control, .custom-select")
        .addClass("is-valid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_error")
        .find(".form-control, .custom-select")
        .removeClass("is-invalid");
      $(this).siblings(".o_invalid_field").remove();
    } else {
      $(this)
        .parent(".form-group")
        .addClass("o_has_error")
        .find(".form-control, .custom-select")
        .addClass("is-invalid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_success")
        .find(".form-control, .custom-select")
        .removeClass("is-valid");
    }
  });
  $("input#cc_cvc").on("focusout", function (e) {
    var cc_nbr = $(this).parents(".oe_cc").find("#cc_number").val();
    var card_type = $.payment.cardType(cc_nbr);
    var valid_value = $.payment.validateCardCVC(this.value, card_type);
    if (valid_value) {
      $(this)
        .parent(".form-group")
        .addClass("o_has_success")
        .find(".form-control, .custom-select")
        .addClass("is-valid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_error")
        .find(".form-control, .custom-select")
        .removeClass("is-invalid");
      $(this).siblings(".o_invalid_field").remove();
    } else {
      $(this)
        .parent(".form-group")
        .addClass("o_has_error")
        .find(".form-control, .custom-select")
        .addClass("is-invalid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_success")
        .find(".form-control, .custom-select")
        .removeClass("is-valid");
    }
  });
  $("input#cc_expiry").on("focusout", function (e) {
    var expiry_value = $.payment.cardExpiryVal(this.value);
    var month = expiry_value.month || "";
    var year = expiry_value.year || "";
    var valid_value = $.payment.validateCardExpiry(month, year);
    if (valid_value) {
      $(this)
        .parent(".form-group")
        .addClass("o_has_success")
        .find(".form-control, .custom-select")
        .addClass("is-valid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_error")
        .find(".form-control, .custom-select")
        .removeClass("is-invalid");
      $(this).siblings(".o_invalid_field").remove();
    } else {
      $(this)
        .parent(".form-group")
        .addClass("o_has_error")
        .find(".form-control, .custom-select")
        .addClass("is-invalid");
      $(this)
        .parent(".form-group")
        .removeClass("o_has_success")
        .find(".form-control, .custom-select")
        .removeClass("is-valid");
    }
  });
  $('select[name="pm_acquirer_id"]').on("change", function () {
    var acquirer_id = $(this).val();
    $(".acquirer").addClass("d-none");
    $('.acquirer[data-acquirer-id="' + acquirer_id + '"]').removeClass(
      "d-none",
    );
  });
});

/* /payment/static/src/js/payment_transaction_portal.js defined in bundle 'web.assets_frontend_lazy' */
/* /payment/static/src/js/payment_form.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("payment.payment_form", function (require) {
  "use strict";
  var core = require("web.core");
  var Dialog = require("web.Dialog");
  var publicWidget = require("web.public.widget");
  var _t = core._t;
  publicWidget.registry.PaymentForm = publicWidget.Widget.extend({
    selector: ".o_payment_form",
    events: {
      submit: "onSubmit",
      "click #o_payment_form_pay": "payEvent",
      "click #o_payment_form_add_pm": "addPmEvent",
      'click button[name="delete_pm"]': "deletePmEvent",
      "click .o_payment_form_pay_icon_more": "onClickMorePaymentIcon",
      "click .o_payment_acquirer_select": "radioClickEvent",
    },
    start: function () {
      this._adaptPayButton();
      window.addEventListener("pageshow", function (event) {
        if (event.persisted) {
          window.location.reload();
        }
      });
      var self = this;
      return this._super.apply(this, arguments).then(function () {
        self.options = _.extend(self.$el.data(), self.options);
        self.updateNewPaymentDisplayStatus();
        $('[data-toggle="tooltip"]').tooltip();
      });
    },
    displayError: function (title, message) {
      var $checkedRadio = this.$('input[type="radio"]:checked'),
        acquirerID = this.getAcquirerIdFromRadio($checkedRadio[0]);
      var $acquirerForm;
      if (this.isNewPaymentRadio($checkedRadio[0])) {
        $acquirerForm = this.$("#o_payment_add_token_acq_" + acquirerID);
      } else if (this.isFormPaymentRadio($checkedRadio[0])) {
        $acquirerForm = this.$("#o_payment_form_acq_" + acquirerID);
      }
      if ($checkedRadio.length === 0) {
        return new Dialog(null, {
          title: _t("Error: ") + _.str.escapeHTML(title),
          size: "medium",
          $content: "<p>" + (_.str.escapeHTML(message) || "") + "</p>",
          buttons: [{ text: _t("Ok"), close: true }],
        }).open();
      } else {
        this.$("#payment_error").remove();
        var messageResult =
          '<div class="alert alert-danger mb4" id="payment_error">';
        if (title != "") {
          messageResult =
            messageResult + "<b>" + _.str.escapeHTML(title) + ":</b><br/>";
        }
        messageResult = messageResult + _.str.escapeHTML(message) + "</div>";
        $acquirerForm.append(messageResult);
      }
    },
    hideError: function () {
      this.$("#payment_error").remove();
    },
    getAcquirerIdFromRadio: function (element) {
      return $(element).data("acquirer-id");
    },
    getFormData: function ($form) {
      var unindexed_array = $form.serializeArray();
      var indexed_array = {};
      $.map(unindexed_array, function (n, i) {
        indexed_array[n.name] = n.value;
      });
      return indexed_array;
    },
    isFormPaymentRadio: function (element) {
      return $(element).data("form-payment") === "True";
    },
    isNewPaymentRadio: function (element) {
      return $(element).data("s2s-payment") === "True";
    },
    updateNewPaymentDisplayStatus: function () {
      var checked_radio = this.$('input[type="radio"]:checked');
      this.$('[id*="o_payment_add_token_acq_"]').addClass("d-none");
      this.$('[id*="o_payment_form_acq_"]').addClass("d-none");
      if (checked_radio.length !== 1) {
        return;
      }
      checked_radio = checked_radio[0];
      var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
      if (this.isNewPaymentRadio(checked_radio)) {
        this.$("#o_payment_add_token_acq_" + acquirer_id).removeClass("d-none");
      } else if (this.isFormPaymentRadio(checked_radio)) {
        this.$("#o_payment_form_acq_" + acquirer_id).removeClass("d-none");
      }
    },
    disableButton: function (button) {
      $("body").block({
        overlayCSS: { backgroundColor: "#000", opacity: 0, zIndex: 1050 },
        message: false,
      });
      $(button).attr("disabled", true);
      $(button).children(".fa-lock").removeClass("fa-lock");
      $(button).prepend(
        '<span class="o_loader"><i class="fa fa-refresh fa-spin"></i>&nbsp;</span>',
      );
    },
    enableButton: function (button) {
      $("body").unblock();
      $(button).attr("disabled", false);
      $(button).children(".fa").addClass("fa-lock");
      $(button).find("span.o_loader").remove();
    },
    _parseError: function (e) {
      if (e.message.data.arguments[1]) {
        return e.message.data.arguments[0] + e.message.data.arguments[1];
      }
      return e.message.data.arguments[0];
    },
    _adaptPayButton: function () {
      var $payButton = $("#o_payment_form_pay");
      var disabledReasons = $payButton.data("disabled_reasons") || {};
      $payButton.prop("disabled", _.contains(disabledReasons, true));
    },
    payEvent: function (ev) {
      ev.preventDefault();
      var form = this.el;
      var checked_radio = this.$('input[type="radio"]:checked');
      var self = this;
      if (ev.type === "submit") {
        var button = $(ev.target).find('*[type="submit"]')[0];
      } else {
        var button = ev.target;
      }
      if (checked_radio.length === 1) {
        checked_radio = checked_radio[0];
        var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
        var acquirer_form = false;
        if (this.isNewPaymentRadio(checked_radio)) {
          acquirer_form = this.$("#o_payment_add_token_acq_" + acquirer_id);
        } else {
          acquirer_form = this.$("#o_payment_form_acq_" + acquirer_id);
        }
        var inputs_form = $("input", acquirer_form);
        var ds = $('input[name="data_set"]', acquirer_form)[0];
        if (this.isNewPaymentRadio(checked_radio)) {
          if (this.options.partnerId === undefined) {
            console.warn(
              "payment_form: unset partner_id when adding new token; things could go wrong",
            );
          }
          var form_data = this.getFormData(inputs_form);
          var wrong_input = false;
          inputs_form.toArray().forEach(function (element) {
            if ($(element).attr("type") == "hidden") {
              return true;
            }
            $(element)
              .closest("div.form-group")
              .removeClass("o_has_error")
              .find(".form-control, .custom-select")
              .removeClass("is-invalid");
            $(element).siblings(".o_invalid_field").remove();
            $(element).trigger("focusout");
            if (element.dataset.isRequired && element.value.length === 0) {
              $(element)
                .closest("div.form-group")
                .addClass("o_has_error")
                .find(".form-control, .custom-select")
                .addClass("is-invalid");
              $(element)
                .closest("div.form-group")
                .append(
                  '<div style="color: red" class="o_invalid_field" aria-invalid="true">' +
                    _.str.escapeHTML("The value is invalid.") +
                    "</div>",
                );
              wrong_input = true;
            } else if (
              $(element).closest("div.form-group").hasClass("o_has_error")
            ) {
              wrong_input = true;
              $(element)
                .closest("div.form-group")
                .append(
                  '<div style="color: red" class="o_invalid_field" aria-invalid="true">' +
                    _.str.escapeHTML("The value is invalid.") +
                    "</div>",
                );
            }
          });
          if (wrong_input) {
            return;
          }
          this.disableButton(button);
          return this._rpc({ route: ds.dataset.createRoute, params: form_data })
            .then(function (data) {
              if (data.result) {
                if (data["3d_secure"] !== false) {
                  $("body").html(data["3d_secure"]);
                } else {
                  checked_radio.value = data.id;
                  form.submit();
                  return new Promise(function () {});
                }
              } else {
                if (data.error) {
                  self.displayError("", data.error);
                } else {
                  self.displayError(
                    _t("Server Error"),
                    _t(
                      "e.g. Your credit card details are wrong. Please verify.",
                    ),
                  );
                }
              }
              self.enableButton(button);
            })
            .guardedCatch(function (error) {
              error.event.preventDefault();
              self.enableButton(button);
              self.displayError(
                _t("Server Error"),
                _t(
                  "We are not able to add your payment method at the moment.",
                ) + self._parseError(error),
              );
            });
        } else if (this.isFormPaymentRadio(checked_radio)) {
          this.disableButton(button);
          var $tx_url = this.$el.find('input[name="prepare_tx_url"]');
          if ($tx_url.length === 1) {
            var form_save_token = acquirer_form
              .find('input[name="o_payment_form_save_token"]')
              .prop("checked");
            return this._rpc({
              route: $tx_url[0].value,
              params: {
                acquirer_id: parseInt(acquirer_id),
                save_token: form_save_token,
                access_token: self.options.accessToken,
                success_url: self.options.successUrl,
                error_url: self.options.errorUrl,
                callback_method: self.options.callbackMethod,
                order_id: self.options.orderId,
                invoice_id: self.options.invoiceId,
              },
            })
              .then(function (result) {
                if (result) {
                  var newForm = document.createElement("form");
                  newForm.setAttribute(
                    "method",
                    self._get_redirect_form_method(),
                  );
                  newForm.setAttribute(
                    "provider",
                    checked_radio.dataset.provider,
                  );
                  newForm.hidden = true;
                  newForm.innerHTML = result;
                  var action_url = $(newForm)
                    .find('input[name="data_set"]')
                    .data("actionUrl");
                  newForm.setAttribute("action", action_url);
                  $(document.getElementsByTagName("body")[0]).append(newForm);
                  $(newForm).find("input[data-remove-me]").remove();
                  if (action_url) {
                    newForm.submit();
                    return new Promise(function () {});
                  }
                } else {
                  self.displayError(
                    _t("Server Error"),
                    _t("We are not able to redirect you to the payment form."),
                  );
                  self.enableButton(button);
                }
              })
              .guardedCatch(function (error) {
                error.event.preventDefault();
                self.displayError(
                  _t("Server Error"),
                  _t("We are not able to redirect you to the payment form.") +
                    " " +
                    self._parseError(error),
                );
                self.enableButton(button);
              });
          } else {
            this.displayError(
              _t("Cannot setup the payment"),
              _t("We're unable to process your payment."),
            );
            self.enableButton(button);
          }
        } else {
          this.disableButton(button);
          form.submit();
          return new Promise(function () {});
        }
      } else {
        this.displayError(
          _t("No payment method selected"),
          _t("Please select a payment method."),
        );
        this.enableButton(button);
      }
    },
    _get_redirect_form_method: function () {
      return "post";
    },
    addPmEvent: function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      var checked_radio = this.$('input[type="radio"]:checked');
      var self = this;
      if (ev.type === "submit") {
        var button = $(ev.target).find('*[type="submit"]')[0];
      } else {
        var button = ev.target;
      }
      if (
        checked_radio.length === 1 &&
        this.isNewPaymentRadio(checked_radio[0])
      ) {
        checked_radio = checked_radio[0];
        var acquirer_id = this.getAcquirerIdFromRadio(checked_radio);
        var acquirer_form = this.$("#o_payment_add_token_acq_" + acquirer_id);
        var inputs_form = $("input", acquirer_form);
        var form_data = this.getFormData(inputs_form);
        var ds = $('input[name="data_set"]', acquirer_form)[0];
        var wrong_input = false;
        inputs_form.toArray().forEach(function (element) {
          if ($(element).attr("type") == "hidden") {
            return true;
          }
          $(element)
            .closest("div.form-group")
            .removeClass("o_has_error")
            .find(".form-control, .custom-select")
            .removeClass("is-invalid");
          $(element).siblings(".o_invalid_field").remove();
          $(element).trigger("focusout");
          if (element.dataset.isRequired && element.value.length === 0) {
            $(element)
              .closest("div.form-group")
              .addClass("o_has_error")
              .find(".form-control, .custom-select")
              .addClass("is-invalid");
            var message =
              '<div style="color: red" class="o_invalid_field" aria-invalid="true">' +
              _.str.escapeHTML("The value is invalid.") +
              "</div>";
            $(element).closest("div.form-group").append(message);
            wrong_input = true;
          } else if (
            $(element).closest("div.form-group").hasClass("o_has_error")
          ) {
            wrong_input = true;
            var message =
              '<div style="color: red" class="o_invalid_field" aria-invalid="true">' +
              _.str.escapeHTML("The value is invalid.") +
              "</div>";
            $(element).closest("div.form-group").append(message);
          }
        });
        if (wrong_input) {
          return;
        }
        $(button).attr("disabled", true);
        $(button).children(".fa-plus-circle").removeClass("fa-plus-circle");
        $(button).prepend(
          '<span class="o_loader"><i class="fa fa-refresh fa-spin"></i>&nbsp;</span>',
        );
        this._rpc({ route: ds.dataset.createRoute, params: form_data })
          .then(function (data) {
            if (data.result) {
              if (data["3d_secure"] !== false) {
                $("body").html(data["3d_secure"]);
              } else {
                if (form_data.return_url) {
                  window.location = form_data.return_url;
                } else {
                  window.location.reload();
                }
              }
            } else {
              if (data.error) {
                self.displayError("", data.error);
              } else {
                self.displayError(
                  _t("Server Error"),
                  _t("e.g. Your credit card details are wrong. Please verify."),
                );
              }
            }
            $(button).attr("disabled", false);
            $(button).children(".fa").addClass("fa-plus-circle");
            $(button).find("span.o_loader").remove();
          })
          .guardedCatch(function (error) {
            error.event.preventDefault();
            $(button).attr("disabled", false);
            $(button).children(".fa").addClass("fa-plus-circle");
            $(button).find("span.o_loader").remove();
            self.displayError(
              _t("Server error"),
              _t("We are not able to add your payment method at the moment.") +
                self._parseError(error),
            );
          });
      } else {
        this.displayError(
          _t("No payment method selected"),
          _t("Please select the option to add a new payment method."),
        );
      }
    },
    onSubmit: function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      var button = $(ev.target).find('*[type="submit"]')[0];
      if (button.id === "o_payment_form_pay") {
        return this.payEvent(ev);
      } else if (button.id === "o_payment_form_add_pm") {
        return this.addPmEvent(ev);
      }
      return;
    },
    deletePmEvent: function (ev) {
      ev.stopPropagation();
      ev.preventDefault();
      var self = this;
      var pm_id = parseInt(ev.currentTarget.value);
      var tokenDelete = function () {
        self
          ._rpc({ model: "payment.token", method: "unlink", args: [pm_id] })
          .then(
            function (result) {
              if (result === true) {
                ev.target.closest("div").remove();
              }
            },
            function () {
              self.displayError(
                _t("Server Error"),
                _t(
                  "We are not able to delete your payment method at the moment.",
                ),
              );
            },
          );
      };
      this._rpc({
        model: "payment.token",
        method: "get_linked_records",
        args: [pm_id],
      }).then(
        function (result) {
          if (result[pm_id].length > 0) {
            var content = "";
            result[pm_id].forEach(function (sub) {
              content +=
                '<p><a href="' +
                sub.url +
                '" title="' +
                sub.description +
                '">' +
                sub.name +
                "</a></p>";
            });
            content = $("<div>").html(
              "<p>" +
                _t("This card is currently linked to the following records:") +
                "</p>" +
                content,
            );
            new Dialog(self, {
              title: _t("Warning!"),
              size: "medium",
              $content: content,
              buttons: [
                {
                  text: _t("Confirm Deletion"),
                  classes: "btn-primary",
                  close: true,
                  click: tokenDelete,
                },
                { text: _t("Cancel"), close: true },
              ],
            }).open();
          } else {
            tokenDelete();
          }
        },
        function (err, event) {
          self.displayError(
            _t("Server Error"),
            _t("We are not able to delete your payment method at the moment.") +
              err.data.message,
          );
        },
      );
    },
    onClickMorePaymentIcon: function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var $listItems = $(ev.currentTarget).parents("ul").children("li");
      var $moreItem = $(ev.currentTarget).parents("li");
      $listItems.removeClass("d-none");
      $moreItem.addClass("d-none");
    },
    radioClickEvent: function (ev) {
      $(ev.currentTarget).find('input[type="radio"]').prop("checked", true);
      this.updateNewPaymentDisplayStatus();
    },
  });
  return publicWidget.registry.PaymentForm;
});

/* /payment/static/src/js/payment_processing.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("payment.processing", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var ajax = require("web.ajax");
  var core = require("web.core");
  var _t = core._t;
  $.blockUI.defaults.css.border = "0";
  $.blockUI.defaults.css["background-color"] = "";
  $.blockUI.defaults.overlayCSS["opacity"] = "0.9";
  publicWidget.registry.PaymentProcessing = publicWidget.Widget.extend({
    selector: ".o_payment_processing",
    xmlDependencies: ["/payment/static/src/xml/payment_processing.xml"],
    _pollCount: 0,
    start: function () {
      this.displayLoading();
      this.poll();
      return this._super.apply(this, arguments);
    },
    startPolling: function () {
      var timeout = 3000;
      if (this._pollCount >= 10 && this._pollCount < 20) {
        timeout = 10000;
      } else if (this._pollCount >= 20) {
        timeout = 30000;
      }
      setTimeout(this.poll.bind(this), timeout);
      this._pollCount++;
    },
    poll: function () {
      var self = this;
      ajax
        .jsonRpc("/payment/process/poll", "call", {})
        .then(function (data) {
          if (data.success === true) {
            self.processPolledData(data.transactions);
          } else {
            switch (data.error) {
              case "tx_process_retry":
                break;
              case "no_tx_found":
                self.displayContent("payment.no_tx_found", {});
                break;
              default:
                self.displayContent("payment.exception", {
                  exception_msg: data.error,
                });
                break;
            }
          }
          self.startPolling();
        })
        .guardedCatch(function () {
          self.displayContent("payment.rpc_error", {});
          self.startPolling();
        });
    },
    processPolledData: function (transactions) {
      var render_values = {
        tx_draft: [],
        tx_pending: [],
        tx_authorized: [],
        tx_done: [],
        tx_cancel: [],
        tx_error: [],
      };
      if (
        transactions.length > 0 &&
        ["transfer", "sepa_direct_debit"].indexOf(
          transactions[0].acquirer_provider,
        ) >= 0
      ) {
        window.location = transactions[0].return_url;
        return;
      }
      transactions.forEach(function (tx) {
        var key = "tx_" + tx.state;
        if (key in render_values) {
          render_values[key].push(tx);
        }
      });
      function countTxInState(states) {
        var nbTx = 0;
        for (var prop in render_values) {
          if (states.indexOf(prop) > -1 && render_values.hasOwnProperty(prop)) {
            nbTx += render_values[prop].length;
          }
        }
        return nbTx;
      }
      if (
        countTxInState([
          "tx_done",
          "tx_error",
          "tx_pending",
          "tx_authorized",
        ]) === 1
      ) {
        var tx =
          render_values["tx_done"][0] ||
          render_values["tx_authorized"][0] ||
          render_values["tx_error"][0];
        if (tx) {
          window.location = tx.return_url;
          return;
        }
      }
      this.displayContent("payment.display_tx_list", render_values);
    },
    displayContent: function (xmlid, render_values) {
      var html = core.qweb.render(xmlid, render_values);
      $.unblockUI();
      this.$el.find(".o_payment_processing_content").html(html);
    },
    displayLoading: function () {
      var msg = _t("We are processing your payment, please wait ...");
      $.blockUI({
        message:
          '<h2 class="text-white"><img src="/web/static/src/img/spin.png" class="fa-pulse"/>' +
          "    <br />" +
          msg +
          "</h2>",
      });
    },
  });
});

/* /sale/static/src/js/sale_portal_sidebar.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("sale.SalePortalSidebar", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  var PortalSidebar = require("portal.PortalSidebar");
  publicWidget.registry.SalePortalSidebar = PortalSidebar.extend({
    selector: ".o_portal_sale_sidebar",
    init: function (parent, options) {
      this._super.apply(this, arguments);
      this.authorizedTextTag = ["em", "b", "i", "u"];
      this.spyWatched = $('body[data-target=".navspy"]');
    },
    start: function () {
      var def = this._super.apply(this, arguments);
      var $spyWatcheElement = this.$el.find('[data-id="portal_sidebar"]');
      this._setElementId($spyWatcheElement);
      this._generateMenu();
      if (
        $.bbq.getState("allow_payment") === "yes" &&
        this.$("#o_sale_portal_paynow").length
      ) {
        this.$("#o_sale_portal_paynow").trigger("click");
        $.bbq.removeState("allow_payment");
      }
      return def;
    },
    _setElementId: function (prefix, $el) {
      var id = _.uniqueId(prefix);
      this.spyWatched.find($el).attr("id", id);
      return id;
    },
    _generateMenu: function () {
      var self = this,
        lastLI = false,
        lastUL = null,
        $bsSidenav = this.$el.find(".bs-sidenav");
      $(
        "#quote_content [id^=quote_header_], #quote_content [id^=quote_]",
        this.spyWatched,
      ).attr("id", "");
      _.each(
        this.spyWatched.find("#quote_content h2, #quote_content h3"),
        function (el) {
          var id, text;
          switch (el.tagName.toLowerCase()) {
            case "h2":
              id = self._setElementId("quote_header_", el);
              text = self._extractText($(el));
              if (!text) {
                break;
              }
              lastLI = $("<li class='nav-item'>")
                .append(
                  $(
                    '<a class="nav-link" style="max-width: 200px;" href="#' +
                      id +
                      '"/>',
                  ).text(text),
                )
                .appendTo($bsSidenav);
              lastUL = false;
              break;
            case "h3":
              id = self._setElementId("quote_", el);
              text = self._extractText($(el));
              if (!text) {
                break;
              }
              if (lastLI) {
                if (!lastUL) {
                  lastUL = $("<ul class='nav flex-column'>").appendTo(lastLI);
                }
                $("<li class='nav-item'>")
                  .append(
                    $(
                      '<a class="nav-link" style="max-width: 200px;" href="#' +
                        id +
                        '"/>',
                    ).text(text),
                  )
                  .appendTo(lastUL);
              }
              break;
          }
        },
      );
    },
    _extractText: function ($node) {
      var self = this;
      var rawText = [];
      _.each($node.contents(), function (el) {
        var current = $(el);
        if ($.trim(current.text())) {
          var tagName = current.prop("tagName");
          if (
            _.isUndefined(tagName) ||
            (!_.isUndefined(tagName) &&
              _.contains(self.authorizedTextTag, tagName.toLowerCase()))
          ) {
            rawText.push($.trim(current.text()));
          }
        }
      });
      return rawText.join(" ");
    },
  });
});

/* /sale_management/static/src/js/sale_management.js defined in bundle 'web.assets_frontend_lazy' */
odoo.define("sale_management.sale_management", function (require) {
  "use strict";
  var publicWidget = require("web.public.widget");
  publicWidget.registry.SaleUpdateLineButton = publicWidget.Widget.extend({
    selector: ".o_portal_sale_sidebar a.js_update_line_json",
    events: { click: "_onClick" },
    start: function () {
      var self = this;
      return this._super.apply(this, arguments).then(function () {
        self.elems = self._getUpdatableElements();
        self.elems.$lineQuantity.change(function (ev) {
          var quantity = parseInt(this.value);
          self._onChangeQuantity(quantity);
        });
      });
    },
    _onChangeQuantity: function (quantity) {
      var href = this.$el.attr("href");
      var orderID = href.match(/my\/orders\/([0-9]+)/);
      var lineID = href.match(/update_line\/([0-9]+)/);
      var params = {
        line_id: parseInt(lineID[1]),
        remove: this.$el.is('[href*="remove"]'),
        unlink: this.$el.is('[href*="unlink"]'),
        input_quantity: quantity >= 0 ? quantity : false,
      };
      var token = href.match(/token=([\w\d-]*)/)[1];
      if (token) {
        params["access_token"] = token;
      }
      orderID = parseInt(orderID[1]);
      this._callUpdateLineRoute(orderID, params).then(
        this._updateOrderValues.bind(this),
      );
    },
    _onClick: function (ev) {
      ev.preventDefault();
      return this._onChangeQuantity();
    },
    _callUpdateLineRoute: function (order_id, params) {
      var url = "/my/orders/" + order_id + "/update_line_dict";
      return this._rpc({ route: url, params: params });
    },
    _updateOrderValues: function (data) {
      if (!data) {
        window.location.reload();
      }
      var orderAmountTotal = data.order_amount_total;
      var orderAmountUntaxed = data.order_amount_untaxed;
      var orderAmountTax = data.order_amount_tax;
      var orderAmountUndiscounted = data.order_amount_undiscounted;
      var orderTotalsTable = $(data.order_totals_table);
      var lineProductUomQty = data.order_line_product_uom_qty;
      var linePriceTotal = data.order_line_price_total;
      var linePriceSubTotal = data.order_line_price_subtotal;
      this.elems.$lineQuantity.val(lineProductUomQty);
      if (this.elems.$linePriceTotal.length && linePriceTotal !== undefined) {
        this.elems.$linePriceTotal.text(linePriceTotal);
      }
      if (
        this.elems.$linePriceSubTotal.length &&
        linePriceSubTotal !== undefined
      ) {
        this.elems.$linePriceSubTotal.text(linePriceSubTotal);
      }
      if (orderAmountUntaxed !== undefined) {
        this.elems.$orderAmountUntaxed.text(orderAmountUntaxed);
      }
      if (orderAmountTotal !== undefined) {
        this.elems.$orderAmountTotal.text(orderAmountTotal);
      }
      if (orderAmountUndiscounted !== undefined) {
        this.elems.$orderAmountUndiscounted.text(orderAmountUndiscounted);
      }
      if (orderTotalsTable) {
        this.elems.$orderTotalsTable
          .find("table")
          .replaceWith(orderTotalsTable);
      }
    },
    _getUpdatableElements: function () {
      var $parentTr = this.$el.parents("tr:first");
      var $linePriceTotal = $parentTr.find(
        ".oe_order_line_price_total .oe_currency_value",
      );
      var $linePriceSubTotal = $parentTr.find(
        ".oe_order_line_price_subtotal .oe_currency_value",
      );
      if (!$linePriceTotal.length && !$linePriceSubTotal.length) {
        $linePriceTotal = $linePriceSubTotal = $parentTr
          .find(".oe_currency_value")
          .last();
      }
      var $orderAmountUntaxed = $('[data-id="total_untaxed"]').find("span, b");
      var $orderAmountTotal = $('[data-id="total_amount"]').find("span, b");
      var $orderAmountUndiscounted = $('[data-id="amount_undiscounted"]').find(
        "span, b",
      );
      if (!$orderAmountUntaxed.length) {
        $orderAmountUntaxed = $orderAmountTotal.eq(1);
        $orderAmountTotal = $orderAmountTotal
          .eq(0)
          .add($orderAmountTotal.eq(2));
      }
      return {
        $lineQuantity: this.$el.closest(".input-group").find(".js_quantity"),
        $linePriceSubTotal: $linePriceSubTotal,
        $linePriceTotal: $linePriceTotal,
        $orderAmountUntaxed: $orderAmountUntaxed,
        $orderAmountTotal: $orderAmountTotal,
        $orderTotalsTable: $("#total"),
        $orderAmountUndiscounted: $orderAmountUndiscounted,
      };
    },
  });
});
