{
  description = "A project with a devshell.";

  inputs = {
    flake-parts.url = "flake:flake-parts";
    nixpkgs.url = "https://flakehub.com/f/DeterminateSystems/nixpkgs-weekly/*.tar.gz";
    portless.url = "github:haglobah/portless";
  };

  outputs = inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [];
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];
      perSystem = { config, self', inputs', pkgs, system, ... }: {
        _module.args.pkgs = import inputs.nixpkgs { inherit system; };
        # Per-system attributes can be defined here. The self' and inputs'
        # module parameters provide easy access to attributes of the same
        # system.

        # Equivalent to  inputs'.nixpkgs.legacyPackages.hello;
        # packages.default = pkgs.hello;
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            bun
            typescript-language-server
            astro-language-server
            oxfmt
            just
            playwright-test
            inputs'.portless.packages.default
          ];
          shellHook = ''
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
          '';
        };
      };
      flake = {
        # The usual flake attributes can be defined here, including system-
        # agnostic ones like nixosModule and system-enumerating ones, although
        # those are more easily expressed in perSystem.

      };
    };
}
