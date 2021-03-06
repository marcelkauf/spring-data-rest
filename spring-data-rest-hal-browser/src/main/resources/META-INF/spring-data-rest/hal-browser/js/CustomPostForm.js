/**
 * Custom Backbone view that uses JSON Schema metadata to create pop-up dialog with actual field names instead of
 * asking user to input raw JSON.
 *
 * NOTE: Links to other resources are shown as simple text fields. The user is responsible for inserting the correct URI.
 * For '* to many' associations, it is currently only possible to insert ONE URI.
 * Additional links have to be set via POST/PUT/PATCH operations with the proper media type.
 * Jackson has to be configured properly for this to work (set spring.jackson.deserialization.accept-empty-string-as-null-object and
 * spring.jackson.deserialization.accept-single-value-as-array to true).
 *
 * @author Greg Turnquist
 * @author Gregory Frank
 * @author Marcel Kauf
 * @since 2.4
 * @see DATAREST-627, DATAREST-1077, DATAREST-721
 */
/* jshint strict: true */
/* globals HAL, Backbone, _, $, window, jqxhr */

'use strict';

var CustomPostForm = Backbone.View.extend({
	initialize: function (opts) {
		this.href = opts.href.split('{')[0];
		this.vent = opts.vent;
		_.bindAll(this, 'createNewResource');
	},

	events: {
		'submit form': 'createNewResource'
	},

	className: 'modal fade',

	/**
	 * Perform a POST/PUT operation on the resource.
	 *
	 * @param e
	 */
	createNewResource: function (e) {
		e.preventDefault();

		var self = this;

		var opts = {
			url: this.$('.url').val(),
			headers: _.defaults({'Content-Type': 'application/json'}, HAL.client.getHeaders()),
			method: this.$('.method').val(),
			data: this.getNewResourceData()
		};

		HAL.client.request(opts).done(function (response) {
			self.vent.trigger('response', {resource: response, jqxhr: jqxhr});
		}).fail(function (e) {
			self.vent.trigger('fail-response', {jqxhr: jqxhr});
		}).always(function (e) {
			self.vent.trigger('response-headers', {jqxhr: jqxhr});
			window.location.hash = 'NON-GET:' + opts.url;
		});

		this.$el.modal('hide');
	},

	/**
	 * Draw the dialog after fetching the resource's JSON Schema metadata. If no metadata is available, use the
	 * fallback editor.
	 *
	 * @param opts
	 * @returns {CustomPostForm}
	 */
	render: function (opts) {
		var self = this;

		try {
			HAL.client.request({
				method: 'HEAD',
				headers: HAL.client.getHeaders(),
				url: this.href
			}).done(function (message, text, jqXHR) {
				self.$el.html(self.template({href: self.href}));

				try {
					var hal = self.w3cLinksToHalLinks(jqXHR.getResponseHeader('Link'));

					HAL.client.request({
						method: 'GET',
						url: hal._links.profile.href,
						headers: _.defaults({'Accept': 'application/schema+json'}, HAL.client.getHeaders())
					}).done(function (schema) {
						self.loadJsonEditor(schema);
					});
				} catch (e) {
					self.loadFallbackEditor();
				}

				self.$el.modal();
			});
		} catch (e) {
			self.loadFallbackEditor();
			self.$el.modal();
		}


		return this;
	},

	/**
	 * Load the JSON Schema-driven editor.
	 *
	 * @see https://github.com/jdorn/json-editor
	 */
	loadJsonEditor: function (schema) {
		var self = this;

		/**
		 * See https://github.com/jdorn/json-editor#options for more customizing options.
		 */
		this.editor = new window.JSONEditor(this.$('#jsoneditor')[0], {
			theme: 'bootstrap2',
			schema: schema,
			disable_collapse: true,
			disable_edit_json: true,
			disable_properties: true
		});

		this.getNewResourceData = function() {
			return JSON.stringify(self.editor.getValue());
		}
	},

	/**
	 * Load fallback editor that doesn't depend on any form of metadata.
	 */
	loadFallbackEditor: function () {
		var editor = this.$('#jsoneditor');

		editor.append($('<h4>' + this.href + '</h4>'));

		var inputBox = $('<textarea name="body" class="body" style="height: 200px">{\n}</textarea>');
		editor.append(inputBox);

		this.getNewResourceData = function() {
			return inputBox.val();
		}
	},

	/**
	 * Convert a W3C link header into a HAL-based set of _links.
	 *
	 * e.g.
	 * <http://localhost:8080/persons>; rel="persons",<http://localhost:8080/profile/persons>; rel="profile"
	 * to
	 * {
	 * 	_links: {
	 * 		persons: {
	 * 			href: http://localhost:8080/persons
	 * 		},
	 * 		profile: {
	 *	 		href: http://localhost:8080/profile/persons
	 * 		}
	 * 	}
	 * }
	 *
	 * @param linkHeader - HTTP Response header containing a list of W3C compliant links with rels.
	 * @see http://www.w3.org/wiki/LinkHeader
	 */
	w3cLinksToHalLinks: function (linkHeader) {
		var w3cLinks = linkHeader.split(',');

		var halLinks = {_links: {}};

		w3cLinks.forEach(function (w3cLink) {
			var parts = w3cLink.split(';');

			var hrefWrappedWithBrackets = parts[0];
			var href = hrefWrappedWithBrackets.slice(1, parts[0].length - 1);

			var w3cRel = parts[1];
			var relWrappedWithQuotes = w3cRel.split('=')[1];
			var rel = relWrappedWithQuotes.slice(1, relWrappedWithQuotes.length - 1);

			halLinks._links[rel] = { "href": href };
		});

		return halLinks;
	},

	/**
	 * Look up the HTML template.
	 */
	template: _.template($('#dynamic-request-template').html())
});

/**
 * Inject the form into the HAL Browser.
 */
HAL.customPostForm = CustomPostForm;
