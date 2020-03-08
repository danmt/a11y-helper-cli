/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from "@angular-devkit/core";
import {
  FileOperator,
  Rule,
  SchematicsException,
  Tree,
  apply,
  applyTemplates,
  chain,
  filter,
  forEach,
  mergeWith,
  move,
  noop,
  url
} from "@angular-devkit/schematics";
import * as ts from "typescript";
import {
  addDeclarationToModule,
  addEntryComponentToModule,
  addExportToModule,
  getDeclaration
} from "../utility/ast-utils";
import { InsertChange } from "../utility/change";
import {
  buildRelativePath,
  findModuleFromOptions
} from "../utility/find-module";
import { applyLintFix } from "../utility/lint-fix";
import { parseName } from "../utility/parse-name";
import { validateHtmlSelector, validateName } from "../utility/validation";
import { buildDefaultPath, getWorkspace } from "../utility/workspace";
import { Schema as ComponentOptions } from "./schema";

function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
  const text = host.read(modulePath);
  if (text === null) {
    throw new SchematicsException(`File ${modulePath} does not exist.`);
  }
  const sourceText = text.toString("utf-8");

  return ts.createSourceFile(
    modulePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}

function addDeclarationToNgModule(options: ComponentOptions): Rule {
  return (host: Tree) => {
    if (options.skipImport || !options.module) {
      return host;
    }

    options.type = options.type != null ? options.type : "Component";

    const modulePath = options.module;
    const source = readIntoSourceFile(host, modulePath);

    const componentPath =
      `/${options.path}/` +
      (options.flat ? "" : strings.dasherize(options.name) + "/") +
      strings.dasherize(options.name) +
      (options.type ? "." : "") +
      strings.dasherize(options.type);
    const relativePath = buildRelativePath(modulePath, componentPath);
    const classifiedName =
      strings.classify(options.name) + strings.classify(options.type);
    const declarationChanges = addDeclarationToModule(
      source,
      modulePath,
      classifiedName,
      relativePath
    );

    const declarationRecorder = host.beginUpdate(modulePath);
    for (const change of declarationChanges) {
      if (change instanceof InsertChange) {
        declarationRecorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(declarationRecorder);

    if (options.export) {
      // Need to refresh the AST because we overwrote the file in the host.
      const source = readIntoSourceFile(host, modulePath);

      const exportRecorder = host.beginUpdate(modulePath);
      const exportChanges = addExportToModule(
        source,
        modulePath,
        strings.classify(options.name) + strings.classify(options.type),
        relativePath
      );

      for (const change of exportChanges) {
        if (change instanceof InsertChange) {
          exportRecorder.insertLeft(change.pos, change.toAdd);
        }
      }
      host.commitUpdate(exportRecorder);
    }

    if (options.entryComponent) {
      // Need to refresh the AST because we overwrote the file in the host.
      const source = readIntoSourceFile(host, modulePath);

      const entryComponentRecorder = host.beginUpdate(modulePath);
      const entryComponentChanges = addEntryComponentToModule(
        source,
        modulePath,
        strings.classify(options.name) + strings.classify(options.type),
        relativePath
      );

      for (const change of entryComponentChanges) {
        if (change instanceof InsertChange) {
          entryComponentRecorder.insertLeft(change.pos, change.toAdd);
        }
      }
      host.commitUpdate(entryComponentRecorder);
    }

    return host;
  };
}

function addComponentToModule(path: string, dasherized: string): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }

    const sourceText = text.toString();

    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const addDeclaration = getDeclaration(
      sourceFile,
      path,
      "COMPONENTS",
      `'${dasherized}'`
    ) as InsertChange;

    const recorder = host.beginUpdate(path);
    recorder.insertLeft(addDeclaration.pos, addDeclaration.toAdd);
    host.commitUpdate(recorder);

    return host;
  };
}

function buildSelector(options: ComponentOptions, projectPrefix: string) {
  let selector = strings.dasherize(options.name);
  if (options.prefix) {
    selector = `${options.prefix}-${selector}`;
  } else if (options.prefix === undefined && projectPrefix) {
    selector = `${projectPrefix}-${selector}`;
  }

  return selector;
}

export default function(options: ComponentOptions): Rule {
  return async (host: Tree) => {
    const workspace = await getWorkspace(host);
    const project = workspace.projects.get(options.project as string);

    if (options.path === undefined && project) {
      options.path = buildDefaultPath(project);
    }

    const parentDasherized = strings.dasherize(options.parent);
    const parsedPath = parseName(options.path as string, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path + "/" + parentDasherized + "/components";
    options.selector =
      options.selector ||
      buildSelector(options, (project && project.prefix) || "");

    options.module = findModuleFromOptions(host, options);

    validateName(options.name);
    validateHtmlSelector(options.selector);

    const templateSource = apply(url("./files"), [
      options.skipTests
        ? filter(path => !path.endsWith(".spec.ts.template"))
        : noop(),
      options.inlineStyle
        ? filter(path => !path.endsWith(".__style__.template"))
        : noop(),
      options.inlineTemplate
        ? filter(path => !path.endsWith(".html.template"))
        : noop(),
      applyTemplates({
        ...strings,
        "if-flat": (s: string) => (options.flat ? "" : s),
        ...options
      }),
      !options.type
        ? forEach((file => {
            if (!!file.path.match(new RegExp(".."))) {
              return {
                content: file.content,
                path: file.path.replace("..", ".")
              };
            } else {
              return file;
            }
          }) as FileOperator)
        : noop(),
      move(options.path)
    ]);

    return chain([
      addDeclarationToNgModule(options),
      addComponentToModule(
        `src/app/${parentDasherized}/consts/components.const.ts`,
        strings.dasherize(options.name)
      ),
      mergeWith(templateSource),
      options.lintFix ? applyLintFix(options.path) : noop()
    ]);
  };
}
