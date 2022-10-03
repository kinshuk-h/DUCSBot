/** Creates a runtime template string within which values can be substituted later.
 *
 * @param {TemplateStringsArray} strings The strings parsed from the template.
 * @param  {...(string | number | symbol)} keys The keys to be substituted. For named variables, use string keys.
 * @returns {(...Object) => string} A function that substitutes the given arguments
 *      into the template and returns the final string.
 *
 * @example
 *    > const greet = template`Hello, ${0}! How are you today?`;
 *      console.log(greet("John")); // Hello, John! How are you today?;
 *
 *    > const url = template`https://example.com?q=${'query'}`;
 *      const myurl = url({ query: "hello+world" });
 *      // const myurl = "https://example.com?q=hello+world";
 */
function template(strings, ...keys) {
    return (...values) => {
        const dict = values[values.length - 1] || {};
        let result = [ strings[0] ];
        keys.forEach(function(key, i) {
            let value = Number.isInteger(key) ? values[key] : dict[key] ?? '';
            result.push(value, strings[i + 1]);
        });
        return result.join('');
    };
}
/** Combines multiple template literals into a single template.
 *
 * @param  {...(...Object) => string} templates Individual templates created using the template tag.
 *
 * @returns {(...Object) => string} A function that substitutes the given arguments
 *      into the templates and returns the final string.
 */
const join = (...templates) => (...values) => templates.map(temp => temp(...values)).join("");

module.exports = exports = {
    template, join
}