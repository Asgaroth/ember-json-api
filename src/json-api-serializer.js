var get = Ember.get;
var isNone = Ember.isNone;

DS.JsonApiSerializer = DS.RESTSerializer.extend({
  keyForRelationship: function(key) {
    return Ember.String.camelize(key);
  },

  keyForSnapshot: function(snapshot) {
    return snapshot.modelName;
  },
  /**
   * Patch the extractSingle method, since there are no singular records
   */
  extractSingle: function(store, primaryType, payload, recordId, requestType) {
    var primaryTypeName;
    if (this.keyForAttribute) {
      primaryTypeName = this.keyForAttribute(primaryType.modelName);
    } else {
      primaryTypeName = primaryType.modelName;
    }

    var json = {};

    for (var key in payload) {
      var typeName = Ember.String.singularize(key);
      if (typeName === primaryTypeName &&
          Ember.isArray(payload[key])) {
        json[typeName] = payload[key][0];
      } else {
        json[key] = payload[key];
      }
    }
    return this._super(store, primaryType, json, recordId, requestType);
  },

  /**
   * Flatten links
   */
  normalize: function(type, hash, prop) {
    var json = this.normalizeLinks(hash);
    return this._super(type, json, prop);
  },

  normalizeLinks: function(hash) {
    var json = {};
    for (var key in hash) {
      if (key !== 'links') {
        var camelizedKey = Ember.String.camelize(key);
        json[camelizedKey] = hash[key];
      } else if (Ember.typeOf(hash[key]) === 'object') {
        for (var link in hash[key]) {
          var linkValue = hash[key][link];
          link = Ember.String.camelize(link);
          if (linkValue && Ember.typeOf(linkValue) === 'object' && linkValue.href) {
            json.links = json.links || {};
            json.links[link] = linkValue.href;
          } else if (linkValue && Ember.typeOf(linkValue) === 'object' && linkValue.ids) {
            json[link] = linkValue.ids;
          } else {
            json[link] = linkValue;
          }
        }
      }
    }
    return json;
  },

  /**
   * Extract top-level "meta" & "links" before normalizing.
   */
  normalizePayload: function(payload) {
    if (payload.meta) {
      this.extractMeta(payload.meta);
      delete payload.meta;
    }
    if (payload.links) {
      this.extractLinks(payload.links);
      delete payload.links;
    }
    if (payload.linked) {
      this.extractLinked(payload.linked);
      delete payload.linked;
    }
    return payload;
  },

  /**
   * Extract top-level "linked" containing associated objects
   */
  extractLinked: function(linked) {
    var link, values, value, relation;
    var store = get(this, 'store') || this.container.lookup('store:main');

    for (link in linked) {
      values = linked[link];
      for (var i = values.length - 1; i >= 0; i--) {
        value = values[i];

        if (value.links) {
          value = this.normalizeLinks(value);
          for (relation in value.links) {
            value[relation] = value.links[relation];
          }
          delete value.links;
        }
      }
    }
    this.pushPayload(store, linked);
  },

  /**
   * Parse the top-level "links" object.
   */
  extractLinks: function(links) {
    var link, key, value, route;
    var extracted = [], linkEntry, linkKey;

    for (link in links) {
      key = link.split('.').pop();
      value = links[link];
      if (typeof value === 'string') {
        route = value;
      } else {
        key = value.type || key;
        route = value.href;
      }

      // strip base url
      if (route.substr(0, 4).toLowerCase() === 'http') {
        route = route.split('//').pop().split('/').slice(1).join('/');
      }

      // strip prefix slash
      if (route.charAt(0) === '/') {
        route = route.substr(1);
      }
      linkEntry = { };
      linkKey = Ember.String.singularize(key);
      linkEntry[linkKey] = route;
      extracted.push(linkEntry);
      DS._routes[linkKey] = route;
    }
    return extracted;
  },

  // SERIALIZATION

  /**
   * Use "links" key, remove support for polymorphic type
   */
  serializeBelongsTo: function(record, json, relationship) {
    var attr = relationship.key;
    var belongsTo = record.belongsTo(attr);

    if (isNone(belongsTo)) {
      return;
    }

    var type = this.keyForSnapshot(belongsTo);
    var key = this.keyForRelationship(attr);

    json.links = json.links || {};
    json.links[key] = this._belongsToLink(key, Ember.String.camelize(type), get(belongsTo, 'id'));
  },

  /**
   * Use "links" key
   */
  serializeHasMany: function(snapshot, json, relationship) {
    var attr = relationship.key;
    var type = this.keyForRelationship(relationship.type);
    var key = this.keyForRelationship(attr);

    if (relationship.kind === 'hasMany') {
      json.links = json.links || {};
      json.links[key] = this._hasManyLink(key, type, snapshot, attr);
    }
  },

  _belongsToLink: function(key, type, value) {
    var link = value;
    if (link && key !== type) {
      link = {
        id: link,
        type: type
      };
    }
    return link;
  },

  _hasManyLink: function(key, type, snapshot, attr) {
    var ids = snapshot.hasMany(attr, {ids: true}) || [];
    var link = ids;
    if (ids) {
      if (key !== Ember.String.pluralize(type)) {
        link = {
          ids: ids,
          type: type
        };
      }
    }
    return link;
  }
});

export default DS.JsonApiSerializer;
