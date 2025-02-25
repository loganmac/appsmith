import type {
  ConfigTree,
  DataTree,
  DataTreeEntity,
  WidgetEntityConfig,
} from "entities/DataTree/dataTreeFactory";
import { ENTITY_TYPE } from "entities/DataTree/dataTreeFactory";
import { uniqueId, isFunction, isObject } from "lodash";
import { entityDefinitions } from "@appsmith/utils/autocomplete/EntityDefinitions";
import { getType, Types } from "utils/TypeHelpers";
import type { Def } from "tern";
import {
  isAction,
  isAppsmithEntity,
  isJSAction,
  isTrueObject,
  isWidget,
} from "@appsmith/workers/Evaluation/evaluationUtils";
import type { DataTreeDefEntityInformation } from "utils/autocomplete/CodemirrorTernService";

export type ExtraDef = Record<string, Def | string>;

import type { JSActionEntityConfig } from "entities/DataTree/types";
import type { Variable } from "entities/JSCollection";
import WidgetFactory from "utils/WidgetFactory";
import { shouldAddSetter } from "workers/Evaluation/evaluate";

// Def names are encoded with information about the entity
// This so that we have more info about them
// when sorting results in autocomplete
// DATA_TREE.{entityType}.{entitySubType}.{entityName}
// eg DATA_TREE.WIDGET.TABLE_WIDGET_V2.Table1
// or DATA_TREE.ACTION.ACTION.Api1
export const dataTreeTypeDefCreator = (
  dataTree: DataTree,
  jsData: Record<string, unknown> = {},
  configTree: ConfigTree,
): { def: Def; entityInfo: Map<string, DataTreeDefEntityInformation> } => {
  // When there is a complex data type, we store it in extra def and refer to it in the def
  const extraDefsToDefine: Def = {};

  const def: Def = {
    "!name": "DATA_TREE",
  };
  const entityMap: Map<string, DataTreeDefEntityInformation> = new Map();

  Object.entries(dataTree).forEach(([entityName, entity]) => {
    if (isWidget(entity)) {
      const widgetType = entity.type;
      const autocompleteDefinitions =
        WidgetFactory.getAutocompleteDefinitions(widgetType);

      if (autocompleteDefinitions) {
        const entityConfig = configTree[entityName] as WidgetEntityConfig;

        if (isFunction(autocompleteDefinitions)) {
          def[entityName] = autocompleteDefinitions(
            entity,
            extraDefsToDefine,
            entityConfig,
          );
        } else {
          def[entityName] = autocompleteDefinitions;
        }

        addSettersToDefinitions(def[entityName] as Def, entity, entityConfig);

        flattenDef(def, entityName);

        entityMap.set(entityName, {
          type: ENTITY_TYPE.WIDGET,
          subType: widgetType,
        });
      }
    } else if (isAction(entity)) {
      def[entityName] = entityDefinitions.ACTION(entity, extraDefsToDefine);
      flattenDef(def, entityName);
      entityMap.set(entityName, {
        type: ENTITY_TYPE.ACTION,
        subType: "ACTION",
      });
    } else if (isAppsmithEntity(entity)) {
      def.appsmith = entityDefinitions.APPSMITH(entity, extraDefsToDefine);
      entityMap.set("appsmith", {
        type: ENTITY_TYPE.APPSMITH,
        subType: ENTITY_TYPE.APPSMITH,
      });
    } else if (isJSAction(entity)) {
      const entityConfig = configTree[entityName] as JSActionEntityConfig;
      const metaObj = entityConfig.meta;
      const jsPropertiesDef: Def = {};

      for (const funcName in metaObj) {
        const funcTypeDef = generateJSFunctionTypeDef(
          jsData,
          `${entityName}.${funcName}`,
          extraDefsToDefine,
        );
        jsPropertiesDef[funcName] = funcTypeDef;
        // To also show funcName.data in autocompletion hint, we explictly add it here
        jsPropertiesDef[`${funcName}.data`] = funcTypeDef.data;
      }

      for (let i = 0; i < entityConfig?.variables?.length; i++) {
        const varKey = entityConfig?.variables[i];
        const varValue = entity[varKey];
        jsPropertiesDef[varKey] = generateTypeDef(varValue, extraDefsToDefine);
      }

      def[entityName] = jsPropertiesDef;
      entityMap.set(entityName, {
        type: ENTITY_TYPE.JSACTION,
        subType: "JSACTION",
      });
    }
  });

  if (Object.keys(extraDefsToDefine)) {
    def["!define"] = { ...extraDefsToDefine };
  }

  return { def, entityInfo: entityMap };
};

export function generateTypeDef(
  value: unknown,
  extraDefsToDefine?: ExtraDef,
  depth = 0,
): Def | string {
  switch (getType(value)) {
    case Types.ARRAY: {
      const array = value as [unknown];
      if (depth > 5) {
        return `[?]`;
      }

      const arrayElementType = generateTypeDef(
        array[0],
        extraDefsToDefine,
        depth + 1,
      );

      if (isObject(arrayElementType)) {
        if (extraDefsToDefine) {
          const uniqueDefName = uniqueId("def_");
          extraDefsToDefine[uniqueDefName] = arrayElementType;
          return `[${uniqueDefName}]`;
        }
        return `[?]`;
      }
      return `[${arrayElementType}]`;
    }
    case Types.OBJECT: {
      const objType: Def = {};
      const object = value as Record<string, unknown>;
      Object.keys(object).forEach((k) => {
        objType[k] = generateTypeDef(object[k], extraDefsToDefine, depth);
      });
      return objType;
    }
    case Types.STRING:
      return "string";
    case Types.NUMBER:
      return "number";
    case Types.BOOLEAN:
      return "bool";
    case Types.NULL:
    case Types.UNDEFINED:
      return "?";
    default:
      return "?";
  }
}

export const flattenDef = (def: Def, entityName: string): Def => {
  const flattenedDef = def;
  if (!isTrueObject(def[entityName])) return flattenedDef;
  Object.entries(def[entityName]).forEach(([key, value]) => {
    if (key.startsWith("!")) return;
    const keyIsValid = isValidVariableName(key);
    const parentCompletion = !keyIsValid
      ? `${entityName}["${key}"]`
      : `${entityName}.${key}`;
    flattenedDef[parentCompletion] = value;
    if (!isTrueObject(value)) return;
    Object.entries(value).forEach(([subKey, subValue]) => {
      if (subKey.startsWith("!")) return;
      const childKeyIsValid = isValidVariableName(subKey);
      const childCompletion = !childKeyIsValid
        ? `${parentCompletion}["${subKey}"]`
        : `${parentCompletion}.${subKey}`;
      flattenedDef[childCompletion] = subValue;
    });
  });
  return flattenedDef;
};

const VALID_VARIABLE_NAME_REGEX = /^([a-zA-Z_$][a-zA-Z\d_$]*)$/;

export const isValidVariableName = (variableName: string) =>
  VALID_VARIABLE_NAME_REGEX.test(variableName);

export const getFunctionsArgsType = (args: Variable[]): string => {
  // skip same name args to avoiding creating invalid type
  const argNames = new Set<string>();
  // skip invalid args name
  args.forEach((arg) => {
    if (arg.name && isValidVariableName(arg.name)) argNames.add(arg.name);
  });
  const argNamesArray = [...argNames];
  const argsTypeString = argNamesArray.reduce(
    (accumulatedArgType, argName, currentIndex) => {
      switch (currentIndex) {
        case 0:
          return `${argName}: ?`;
        case 1:
          return `${accumulatedArgType}, ${argName}: ?`;
        default:
          return `${accumulatedArgType}, ${argName}: ?`;
      }
    },
    argNamesArray[0],
  );
  return argsTypeString ? `fn(${argsTypeString})` : `fn()`;
};

export function generateJSFunctionTypeDef(
  jsData: Record<string, unknown> = {},
  fullFunctionName: string,
  extraDefs: ExtraDef,
) {
  return {
    "!type": getFunctionsArgsType([]),
    data: generateTypeDef(jsData[fullFunctionName], extraDefs),
  };
}

export function addSettersToDefinitions(
  definitions: Def,
  entity: DataTreeEntity,
  entityConfig?: WidgetEntityConfig,
) {
  if (entityConfig && entityConfig.__setters) {
    const setters = Object.keys(entityConfig.__setters);

    setters.forEach((setterName: string) => {
      const setter = entityConfig.__setters?.[setterName];
      const setterType = entityConfig.__setters?.[setterName].type;

      if (shouldAddSetter(setter, entity)) {
        definitions[
          setterName
        ] = `fn(value:${setterType}) -> +Promise[:t=[!0.<i>.:t]]`;
      }
    });
  }
}
