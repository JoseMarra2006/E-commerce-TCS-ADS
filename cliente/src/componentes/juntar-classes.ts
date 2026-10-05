export function juntarClasses(...classes: Array<string | false | null | undefined>): string {
  return classes.filter((nome): nome is string => typeof nome === "string" && nome !== "").join(" ");
}
