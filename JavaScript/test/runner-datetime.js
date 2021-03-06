var _ = require('lodash');
var Recognizer = require('@microsoft/recognizers-text-suite');
var DateTimeOptions = require('@microsoft/recognizers-text-date-time').DateTimeOptions;

var Constants = require('./constants');
var SupportedCultures = require('./cultures');
var Extractors = require('./datetime-extractors');
var Parsers = require('./datetime-parsers');

var ignoredTest = null;

var modelFunctions = {
    'DateTimeModel': (input, culture, options, refDate) => Recognizer.recognizeDateTime(input, culture, options, refDate, false)
}

module.exports = function getDateTimeRunner(config) {
    var extractor = getExtractor(config);
    var parser = getParser(config);
    var modelFunction = getModelFunction(config);

    // Extractor only test
    if (config.subType.includes(Constants.Extractor)) {
        if (!extractor) {
            return ignoredTest;
            // throw new Error(`Cannot found extractor for ${JSON.stringify(config)}. Please verify datetime-extractors.js is properly defined.`);
        }

        return getExtractorTestRunner(extractor);
    }

    // Parser test
    if (config.subType.includes(Constants.Parser)) {
        if (!extractor) {
            return ignoredTest;
            // throw new Error(`Cannot found extractor for ${JSON.stringify(config)}. Please verify datetime-extractors.js is properly defined.`);
        }

        if (!parser) {
            return ignoredTest;
            // throw new Error(`Cannot found parser for ${JSON.stringify(config)}. Please verify datetime-parsers.js is properly defined.`);
        }

        if (config.subType.includes("Merged")) {
            return getMergedParserTestRunner(extractor, parser);
        }

        return getParserTestRunner(extractor, parser);
    }

    // Model test
    if (config.subType.includes(Constants.Model)) {
        if (!modelFunction) {
            return ignoredTest;
            // throw new Error(`Cannot found model for ${JSON.stringify(config)}.`);
        }

        return getModelTestRunner(modelFunction);
    }

    return ignoredTest;
};

function getExtractorTestRunner(extractor) {
    return function (t, testCase) {
        var expected = testCase.Results;
        var referenceDateTime = getReferenceDate(testCase);

        if (testCase.Debug) {
            debugger;
        }

        var result = extractor.extract(testCase.Input, referenceDateTime);

        t.is(result.length, expected.length, 'Result count');
        _.zip(result, expected).forEach(o => {
            var actual = o[0];
            var expected = o[1];
            t.is(actual.text, expected.Text, 'Result.Text');
            t.is(actual.typeName, expected.TypeName, 'Result.TypeName');
        });
    };
}

function getParserTestRunner(extractor, parser) {
    return function (t, testCase) {
        var expected = testCase.Results;
        var referenceDateTime = getReferenceDate(testCase);

        if (testCase.Debug) {
            debugger;
        }

        var extractResults = extractor.extract(testCase.Input, referenceDateTime);
        var result = extractResults.map(o => parser.parse(o, referenceDateTime));

        t.is(result.length, expected.length, 'Result count');
        _.zip(result, expected).forEach(o => {
            var actual = o[0];
            var expected = o[1];
            t.is(actual.text, expected.Text, 'Result.Text');
            t.is(actual.typeName, expected.TypeName, 'Result.TypeName');

            if (actual.value && expected.Value) {
                // timex
                t.is(actual.value.timex, expected.Value.Timex, 'Result.Value.Timex');

                // resolutions
                var actualValue = {
                    timex: actual.value.timex,
                    futureResolution: actual.value.futureResolution,
                    pastResolution: actual.value.pastResolution,
                }

                t.deepEqual(actualValue.futureResolution, expected.Value.FutureResolution);
                t.deepEqual(actualValue.pastResolution, expected.Value.PastResolution);
            }
        });
    };
}

function getMergedParserTestRunner(extractor, parser) {
    return function (t, testCase) {
        var expected = testCase.Results;
        var referenceDateTime = getReferenceDate(testCase);

        if (testCase.Debug) {
            debugger;
        }

        var extractResults = extractor.extract(testCase.Input, referenceDateTime);
        var result = extractResults.map(o => parser.parse(o, referenceDateTime));

        t.is(result.length, expected.length, 'Result count');
        _.zip(result, expected).forEach(o => {
            var actual = o[0];
            var expected = o[1];
            t.is(actual.text, expected.Text, 'Result.Text');
            t.is(actual.typeName, expected.TypeName, 'Result.TypeName');

            if (actual.value && expected.Value) {
                t.is(!!actual.value, true, "Result.value is defined");
                _.zip(actual.value.values, expected.Value.values).forEach(o => {
                    var actual = o[0];
                    var expected = o[1];

                    t.deepEqual(actual, expected, 'Values');
                });
            }
        });
    };
}

function getModelTestRunner(getResults) {
    return function (t, testCase) {
        var expected = testCase.Results;
        var referenceDateTime = getReferenceDate(testCase);

        if (testCase.Debug) {
            debugger;
        }

        var result = getResults(testCase.Input, referenceDateTime);
        t.is(result.length, expected.length, 'Result count');
        _.zip(result, expected).forEach(o => {
            var actual = o[0];
            var expected = o[1];
            t.is(actual.text, expected.Text, 'Result.Text');
            t.is(actual.typeName, expected.TypeName, 'Result.TypeName');

            if (actual.resolution) {
                var values = actual.resolution.values;
                t.is(values.length, expected.Resolution.values.length, 'Resolution.Values count');
                t.deepEqual(values, expected.Resolution.values, 'Resolution.Values');
            }
        });
    };
}

function getExtractor(config) {
    var extractorName = config.subType.replace(Constants.Extractor, '').replace(Constants.Parser, '').replace(Constants.Base, '');
    var key = [config.language, extractorName].join('-');
    var extractor = Extractors[key];

    return extractor;
}

function getParser(config) {
    var parserName = config.subType.replace(Constants.Parser, '').replace(Constants.Base, '');
    var key = [config.language, parserName].join('-');
    var parser = Parsers[key];

    return parser;
}

function getModelFunction(config) {
    var modelFunction = modelFunctions['DateTimeModel'];

    var options = DateTimeOptions.None + 
        config.subType.includes('SplitDateAndTime') ? DateTimeOptions.SplitDateAndTime : DateTimeOptions.None +
        config.subType.includes('Calendar') ? DateTimeOptions.Calendar : DateTimeOptions.None;

    var culture = SupportedCultures[config.language].cultureCode;

    return (input, refDate) => modelFunction(input, culture, options, refDate);
}

function parseISOLocal(s) {
    var b = s.split(/\D/);
    return new Date(b[0], b[1] - 1, b[2], b[3], b[4], b[5]);
}

function getReferenceDate(testCase) {
    if (testCase.Context && testCase.Context.ReferenceDateTime) {
        return parseISOLocal(testCase.Context.ReferenceDateTime);
    }

    return null;
}