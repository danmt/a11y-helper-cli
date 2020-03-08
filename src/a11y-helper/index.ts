import {
  Rule,
  SchematicContext,
  Tree,
  url,
  apply,
  mergeWith,
  applyTemplates,
  move,
  chain
} from "@angular-devkit/schematics";
import { Schema } from "./schema";
import { strings, normalize } from "@angular-devkit/core";

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function a11yHelper(_options: Schema): Rule {
  return (_: Tree, _context: SchematicContext) => {
    const templateSource = apply(url("./files"), [
      applyTemplates({
        classify: strings.classify,
        dasherize: strings.dasherize,
        name: _options.name
      }),
      move(normalize("."))
    ]);

    return chain([mergeWith(templateSource)]);
    /* const sourceTemplates = url("./fles");
    const sourceParametrizedTemplates = apply(sourceTemplates, [
      template({
        ..._options,
        ...strings
      })
    ]);
    return mergeWith(sourceParametrizedTemplates)(tree, _context); */
  };
}
