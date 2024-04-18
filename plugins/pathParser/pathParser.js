// Common Patterns
var patterns = {
  movieTitleAndYear: /(.+) \(\d{4}\)/,
  sceneTitleAndPerformers: /(.+) - ([A-zÀ-ú, ]+)/,
};

var rules = [
  {
    name: "1 Level Gallery Titling",
    pattern: [null, ["Websites", "Artists"], null, null],
    fields: {
      studio: "#2",
      title: "#3",
    },
  },
  {
    name: "2 Level Gallery Titling",
    pattern: [null, ["Websites", "Artists"], null, null, null],
    fields: {
      studio: "#2",
      title: "#4",
      tags: ["#3"],
    },
  },
  {
    name: "0 Level Gallery Titling",
    pattern: [null, "Unknown Images", null, null],
    fields: {
      title: "#3",
    },
  },
  {
    name: "1 Level Gallery Titling",
    pattern: [null, "Unknown Images", null, null, null],
    fields: {
      studio: "#3",
      title: "#4",
    },
  },
  {
    name: "2 Level Gallery Titling",
    pattern: [null, "Unknown Images", null, null, null, null],
    fields: {
      studio: "#3",
      title: "#5",
      tags: ["#4"],
    },
  },
];

/* ----------------------------------------------------------------------------
// DO NOT EDIT BELOW!
---------------------------------------------------------------------------- */
function debug(message) {
  if (!DEBUG) {
    return;
  }

  if (typeof message === "string") {
    bufferedOutput.push(message);
    return;
  }

  if (typeof message === "function") {
    message = message();
  }

  bufferedOutput = bufferedOutput.concat(message);
}

function logDebug(logCb) {
  if (DEBUG && bufferedOutput !== null && bufferedOutput.length > 0) {
    logCb("[PathParser] " + bufferedOutput.join("\n> "));
    bufferedOutput = [];
  }
}

function main() {
  try {
    switch (getTask(input.Args)) {
      case "createTags":
        var runTag = getArg(input.Args, "runTag");
        var testTag = getArg(input.Args, "testTag");
        createTags([runTag, testTag]);
        break;

      case "removeTags":
        var runTag = getArg(input.Args, "runTag");
        var testTag = getArg(input.Args, "testTag");
        removeTags([runTag, testTag]);
        break;

      case "runRules":
        var runTag = getArg(input.Args, "runTag");
        initBasePaths();
        runRules(runTag);
        break;

      case "testRules":
        DEBUG = true;
        var testTag = getArg(input.Args, "testTag");
        initBasePaths();
        runRules(testTag);
        break;

      case "scene":
        var id = getId(input.Args);
        initBasePaths();
        matchRuleWithSceneId(id);
        break;

      case "image":
        var id = getId(input.Args);
        initBasePaths();
        break;

      case "gallery":
        var id = getId(input.Args);
        initBasePaths();
        matchRuleWithGalleryId(id);
        break;

      default:
        throw "Unsupported task";
    }
  } catch (e) {
    logDebug(log.Error);
    return { Output: "error", Error: e };
  }

  logDebug(log.Debug);
  return { Output: "ok" };
}

// Get an input arg
function getArg(inputArgs, arg) {
  if (inputArgs.hasOwnProperty(arg)) {
    return inputArgs[arg];
  }

  throw "Input is missing " + arg;
}

// Determine task based on input args
function getTask(inputArgs) {
  if (inputArgs.hasOwnProperty("task")) {
    return inputArgs.task;
  }

  if (!inputArgs.hasOwnProperty("hookContext")) {
    return;
  }

  switch (inputArgs.hookContext.type) {
    case "Scene.Create.Post":
      return "scene";

    case "Image.Create.Post":
      return "image";

    case "Gallery.Create.Post":
      return "gallery";
  }
}

// Get stash paths from configuration
function initBasePaths() {
  var query =
    "\
  query Query {\
    configuration {\
      general {\
        stashes {\
          path\
        }\
      }\
    }\
  }";

  var result = gql.Do(query);
  if (!result.configuration) {
    throw "Unable to get library paths";
  }

  BASE_PATHS = result.configuration.general.stashes.map(function (stash) {
    return stash.path;
  });

  if (BASE_PATHS == null || BASE_PATHS.length == 0) {
    throw "Unable to get library paths";
  }
}

// Create tag if it does not already exist
function createTags(tags) {
  var query =
    "\
  mutation TagCreate($input: TagCreateInput!) {\
    tagCreate(input: $input) {\
      id\
    }\
  }";

  tags.forEach(function (tag) {
    if (tryGetTag(tag) !== null) {
      return;
    }

    var variables = {
      input: {
        name: tag,
      },
    };

    var result = gql.Do(query, variables);
    if (!result.tagCreate) {
      throw "Could not create tag " + tag;
    }
  });
}

// Remove tags if it already exists
function removeTags(tags) {
  tags.forEach(function (tag) {
    var tagId = tryGetTag(tag);
    if (tagId === null) {
      return;
    }

    var query =
      "\
    mutation TagsDestroy($ids: [ID!]!) {\
      tagsDestroy(ids: $ids)\
    }";

    var variables = {
      ids: [tagId],
    };

    var result = gql.Do(query, variables);
    if (!result.tagsDestroy) {
      throw "Unable to remove tag " + tag;
    }
  });
}

// Run rules for scenes containing tag
function runRules(tag) {
  var tagId = tryGetTag(tag);
  if (tagId === null) {
    throw "Tag " + tag + " does not exist";
  }

  var query =
    "\
  query FindIds($sceneFilter: SceneFilterType, $galleryFilter: GalleryFilterType) {\
    findScenes(scene_filter: $sceneFilter) {\
      scenes {\
        id\
      }\
    }\
    findGalleries(gallery_filter: $galleryFilter) {\
      galleries {\
        id\
      }\
    }\
  }";

  var variables = {
    sceneFilter: {
      tags: {
        value: tagId,
        modifier: "INCLUDES",
      },
    },
    galleryFilter: {
      tags: {
        value: tagId,
        modifier: "INCLUDES",
      },
    },
  };

  var result = gql.Do(query, variables);
  if (
    (!result.findGalleries || result.findGalleries.galleries.length == 0) &&
    (!result.findScenes || result.findScenes.scenes.length == 0)
  ) {
    throw "No scenes or galleries found with tag " + tag;
  }

  if (result.findScenes) {
    result.findScenes.scenes.forEach(function (scene) {
      matchRuleWithSceneId(scene.id);
    });
  }
  if (result.findGalleries) {
    result.findGalleries.galleries.forEach(function (gallery) {
      matchRuleWithGalleryId(gallery.id);
    });
  }
}

// Get scene/image id from input args
function getId(inputArgs) {
  if ((id = inputArgs.hookContext.id) == null) {
    throw "Input is missing id";
  }

  return id;
}

function matchFilePaths(id, files, applyRuleCb) {
  for (var i = 0; i < files.length; i++) {
    try {
      matchRuleWithPath(id, files[i].path, applyRuleCb);
      logDebug(log.Info);
      return;
    } catch (e) {
      debug("Error matching rules for " + id + ": " + e.toString());
      logDebug(log.Error);
      continue;
    }
  }
  logDebug(log.Info);
  throw "No rule matches id: " + id;
}

// Apply callback function to first matching rule for id
function matchRuleWithSceneId(sceneId) {
  var query =
    "\
  query FindScene($findSceneId: ID) {\
    findScene(id: $findSceneId) {\
      files {\
        path\
      }\
    }\
  }";

  var variables = {
    findSceneId: sceneId,
  };

  var result = gql.Do(query, variables);
  if (!result.findScene || result.findScene.files.length == 0) {
    throw "Missing scene for id: " + sceneId;
  }

  matchFilePaths(sceneId, result.findScene.files, applySceneRule);
}

function matchRuleWithGalleryId(galleryId) {
  var query =
    "\
  query FindGallery($findGalleryId: ID!) {\
    findGallery(id: $findGalleryId) {\
      files {\
        path\
      }\
    }\
  }";

  var variables = {
    findGalleryId: galleryId,
  };

  var result = gql.Do(query, variables);
  if (!result.findGallery || result.findGallery.files.length == 0) {
    throw "Missing gallery for id: " + galleryId;
  }

  matchFilePaths(galleryId, result.findGallery.files, applyGalleryRule);
}

// Apply callback to first matching rule for path
function matchRuleWithPath(id, path, applyRuleCb) {
  // Remove base path
  for (var i = 0; i < BASE_PATHS.length; i++) {
    if (path.slice(0, BASE_PATHS[i].length) === BASE_PATHS[i]) {
      path = path.slice(BASE_PATHS[i].length);
    }
  }

  debug(path);

  // Split paths into parts
  var parts = path.split(/[\\/]/);

  // Remove extension from filename
  parts[parts.length - 1] = parts[parts.length - 1].slice(
    0,
    parts[parts.length - 1].lastIndexOf(".")
  );

  for (var i = 0; i < rules.length; i++) {
    debug("Rule: " + rules[i].name);
    log.Debug(
      "[PathParser] Rule: " +
        rules[i].name +
        "\nPath: " +
        path +
        "\nParts: " +
        parts
    );
    var data = testRule(rules[i].pattern, parts);
    if (data !== null) {
      applyRuleCb(id, rules[i].fields, data);
      return;
    }
  }

  debug("No matching rule!");
  throw "No matching rule for path: " + path;
}

// Test single rule
function testRule(pattern, parts) {
  debug("Pattern: " + pattern.toString());
  if (pattern.length !== parts.length) {
    return null;
  }

  debug("Pattern length: " + pattern.length);
  debug("Parts length: " + parts.length);
  var matchedParts = [];
  for (var i = 0; i < pattern.length; i++) {
    if ((subMatches = testPattern(pattern[i], parts[i])) == null) {
      return null;
    }

    matchedParts = [].concat(matchedParts, subMatches);
  }

  return matchedParts;
}

function testPattern(pattern, part) {
  // Match anything
  if (pattern == null) {
    return [part];
  }

  // Simple match
  if (typeof pattern === "string") {
    if (pattern === part) {
      return [part];
    }

    return null;
  }

  // Predicate match
  if (typeof pattern == "function") {
    try {
      var results = pattern(part);
      if (results !== null) {
        return results;
      }
    } catch (e) {
      throw e;
    }

    return null;
  }

  // Array match
  if (pattern instanceof Array) {
    for (var i = 0; i < pattern.length; i++) {
      if ((results = testPattern(pattern[i], part)) != null) {
        return results;
      }
    }

    return null;
  }

  // RegExp match
  if (pattern instanceof RegExp) {
    var results = pattern.exec(part);
    if (results === null) {
      return null;
    }

    return results.slice(1);
  }
}

// Apply rule
function applyRule(id, fields, data) {
  var any = false;
  var variables = {
    input: {
      id: id,
    },
  };

  debug(function () {
    var messages = [];
    for (var i = 0; i < data.length; i++) {
      messages.push("#" + i + ": " + data[i]);
    }
    return messages;
  });

  for (var field in fields) {
    var value = fields[field];
    value = value.replace(/#\d+/, function (matched) {
      debug([
        "Matched: " + matched,
        "Matched Substring: " + matched.substring(1),
      ]);
      return data[parseInt(matched.substring(1))];
    });

    debug("Value: " + value);

    switch (field) {
      case "title":
        debug(field + ": " + value);
        variables.input["title"] = value;
        any = true;
        continue;

      case "studio":
        var studioId = tryGetStudio(value);
        if (studioId == null) {
          continue;
        }
        debug([field + ": " + value, "studio_id: " + studioId]);
        variables.input["studio_id"] = studioId;
        any = true;
        continue;

      case "movie_title":
        var movie_title = value.split(" ").join("[\\W]*");
        var movieId = tryGetMovie(movie_title);
        if (movieId == null) {
          continue;
        }

        if (!variables.input.hasOwnProperty("movies")) {
          variables.input["movies"] = [{}];
        }

        debug([field + ": " + value, "movie_id: " + movieId]);
        variables.input["movies"][0]["movie_id"] = movieId;
        any = true;
        continue;

      case "scene_index":
        var sceneIndex = parseInt(value);
        if (isNaN(sceneIndex)) {
          continue;
        }

        if (!variables.input.hasOwnProperty("movies")) {
          variables.input["movies"] = [{}];
        }

        debug("scene_index: " + sceneIndex);
        variables.input["movies"][0]["scene_index"] = sceneIndex;
        continue;

      case "performers":
        var performers = value.split(",").map(tryGetPerformer).filter(notNull);
        if (performers.length == 0) {
          continue;
        }

        debug([
          field + ": " + value,
          "performer_ids: " + performers.join(", "),
        ]);
        variables.input["performer_ids"] = performers;
        any = true;
        continue;

      case "tags":
        var tags = value.split(",").map(tryGetTag).filter(notNull);
        if (tags.length == 0) {
          continue;
        }

        debug([field + ": " + value, "tag_ids: " + tags.join(", ")]);
        variables.input["tag_ids"] = tags;
        any = true;
        continue;
    }
  }

  if (!any) {
    debug("No fields to update!");
  }

  // Remove movies if movie_id is missing
  if (
    variables.input.hasOwnProperty("movies") &&
    !variables.input["movies"][0].hasOwnProperty("movie_id")
  ) {
    delete variables.input["movies"];
  }

  return { success: any, variables: variables };
}

function createSet(fields) {
  if (typeof Set !== "undefined") {
    return new Set(fields);
  } else {
    var temp = {
      has: function (key) {
        return key in temp;
      },
    };
    for (var i = 0; i < fields.length; i += 1) {
      temp[fields[i]] = true;
    }
    return temp;
  }
}

var sceneFields = createSet([
  "title",
  "studio",
  "director",
  "studio",
  "movies",
  "tags",
  "performers",
]);
var galleryFields = createSet([
  "title",
  "studio",
  "photographer",
  "tags",
  "performers",
]);

var validFields = {
  gallery: galleryFields,
  scene: sceneFields,
};

function validateFields(dataType, fields) {
  if (!(dataType in validFields)) {
    throw "Invalid data type " + dataType + " for validating fields";
  }
  var vFields = validFields[dataType];

  for (var field in fields) {
    if (!vFields.has(field)) {
      throw "Invalid field " + field + " for data type " + dataType;
    }
  }
}

function applySceneRule(id, fields, data) {
  validateFields("scene", fields);
  // Apply updates
  var query =
    "\
  mutation Mutation($input: SceneUpdateInput!) {\
    sceneUpdate(input: $input) {\
      id\
    }\
  }";

  var applied = applyRule(id, fields, data);
  if (!applied.success) {
    throw "No fields to update for scene " + id;
  }

  if (DEBUG) {
    // Don't update the value when running tests
    return;
  }
  var variables = applied.variables;
  var result = gql.Do(query, variables);
  if (!result.sceneUpdate) {
    throw "Unable to update scene " + id;
  }
}

function applyGalleryRule(id, fields, data) {
  validateFields("gallery", fields);
  // Apply updates
  var query =
    "\
  mutation Mutation($input: GalleryUpdateInput!) {\
    galleryUpdate(input: $input) {\
      id\
    }\
  }";

  var applied  = applyRule(id, fields, data);
  if (!applied.success) {
    throw "No fields to update for gallery " + id;
  }

  if (DEBUG) {
    // Don't update the value when running tests
    return;
  }
  var variables = applied.variables;
  var result = gql.Do(query, variables);
  if (!result.galleryUpdate) {
    throw "Unable to update gallery " + id;
  }
}

// Returns true for not null elements
function notNull(ele) {
  return ele != null;
}

// Get studio id from studio name
function tryGetStudio(studio) {
  var query =
    "\
  query FindStudios($studioFilter: StudioFilterType) {\
    findStudios(studio_filter: $studioFilter) {\
      studios {\
        id\
      }\
      count\
    }\
  }";

  var variables = {
    studioFilter: {
      name: {
        value: studio.trim(),
        modifier: "EQUALS",
      },
    },
  };

  var result = gql.Do(query, variables);
  if (!result.findStudios || result.findStudios.count == 0) {
    return;
  }

  return result.findStudios.studios[0].id;
}

function tryGetMovie(movie_title) {
  var query =
    "\
  query FindMovies($movieFilter: MovieFilterType) {\
    findMovies(movie_filter: $movieFilter) {\
      movies {\
        id\
      }\
      count\
    }\
  }";

  var variables = {
    movieFilter: {
      name: {
        value: movie_title.trim(),
        modifier: "MATCHES_REGEX",
      },
    },
  };

  var result = gql.Do(query, variables);
  if (!result.findMovies || result.findMovies.count == 0) {
    return;
  }

  return result.findMovies.movies[0].id;
}

// Get performer id from performer name
function tryGetPerformer(performer) {
  var query =
    "\
  query FindPerformers($performerFilter: PerformerFilterType) {\
    findPerformers(performer_filter: $performerFilter) {\
      performers {\
        id\
      }\
      count\
    }\
  }";

  var variables = {
    performerFilter: {
      name: {
        value: performer.trim(),
        modifier: "EQUALS",
      },
    },
  };

  var result = gql.Do(query, variables);
  if (!result.findPerformers || result.findPerformers.count == 0) {
    return;
  }

  return result.findPerformers.performers[0].id;
}

// Get tag id from tag name
function tryGetTag(tag) {
  var query =
    "\
  query FindTags($tagFilter: TagFilterType) {\
    findTags(tag_filter: $tagFilter) {\
      tags {\
        id\
      }\
      count\
    }\
  }";

  var variables = {
    tagFilter: {
      name: {
        value: tag.trim(),
        modifier: "EQUALS",
      },
    },
  };

  var result = gql.Do(query, variables);
  if (!result.findTags || result.findTags.count == 0) {
    return;
  }

  return result.findTags.tags[0].id;
}

var DEBUG = false;
var BASE_PATHS = [];
var bufferedOutput = [];
main();
