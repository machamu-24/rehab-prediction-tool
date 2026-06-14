import type { TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import type { AppRouter } from "../../../server/routers";
import { callDemoProcedure } from "./demoStore";

export function demoLink(): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) => {
      return observable((observer) => {
        callDemoProcedure(op.path, op.input)
          .then((data) => {
            observer.next({ result: { data } });
            observer.complete();
          })
          .catch((error) => {
            observer.error(error);
          });

        return () => {};
      });
    };
  };
}
