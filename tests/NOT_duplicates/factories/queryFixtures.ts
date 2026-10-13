// Fixture: two objects whose only top-level member is an arrow function that
// returns an object literal. The *returned* object is the real shape of the
// entity — comparing only the outer member name (a single shared "fn" property)
// must not make them look identical.

export const UNIT_DEFAULTS = {
  queryOptions: () => ({
    queryKey: ["vitals", "unitDefaults"],
    queryFn: () => null,
    initialData: { weight: "lb" },
  }),
};

export const CALLER = {
  queryOptions: () => ({
    queryKey: ["vitals", "caller"],
    queryFn: () => null,
  }),
};
