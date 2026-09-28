import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version||''))throw Error('Expected a release version');
const assets=resolve(process.argv[3]||'release'),out=resolve(process.argv[4]||join(assets,'bohselecta.rb'));
const base=`https://github.com/irvdotdev/bohselecta/releases/download/v${version}`;
const hash=name=>createHash('sha256').update(readFileSync(join(assets,name))).digest('hex');
const resource=(platform,indent)=>`${' '.repeat(indent)}resource "popup" do
${' '.repeat(indent+2)}url "${base}/boh-popup-${platform}", using: :nounzip
${' '.repeat(indent+2)}sha256 "${hash(`boh-popup-${platform}`)}"
${' '.repeat(indent)}end`;
writeFileSync(out,`class Bohselecta < Formula
  desc "Local model advice and a terminal chooser inside Claude Code"
  homepage "https://irvdotdev.github.io/bohselecta/"
  url "${base}/bohselecta-${version}.tar.gz"
  version "${version}"
  sha256 "${hash(`bohselecta-${version}.tar.gz`)}"
  license "MIT"

  depends_on "node"
  depends_on "tmux"

  on_macos do
    depends_on macos: :sequoia
    on_arm do
${resource('darwin-arm64',6)}
    end
    on_intel do
${resource('darwin-x64',6)}
    end
  end
  on_linux do
    on_arm do
${resource('linux-arm64',6)}
    end
    on_intel do
${resource('linux-x64',6)}
    end
  end

  def install
    # Keep the locked dependency tree private to this formula.
    libexec.install Dir["*", ".[^.]*"]
    cd libexec do
      system "npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"
    end
    resource("popup").stage do
      (libexec/"prototypes/popup/prebuilt").install Dir["boh-popup-*"][0] => "boh-popup"
    end
    chmod 0755, libexec/"prototypes/popup/prebuilt/boh-popup"
    (bin/"bohselecta").write_env_script libexec/"bin/bohselecta", PATH: "#{Formula["node"].opt_bin}:#{Formula["tmux"].opt_bin}:\$PATH"
  end

  def caveats
    <<~EOS
      Sign in to Claude Code first, then run from your project folder:
        bohselecta native refresh claude
        bohselecta setup claude
      After opting in, open a new terminal and type claude.
      Or launch directly: bohselecta popup claude
    EOS
  end

  test do
    ENV["BOHSELECTA_HOME"] = testpath/"data"
    assert_match version.to_s, shell_output("#{bin}/bohselecta --version")
    result = JSON.parse(shell_output("#{bin}/bohselecta recommend claude 'Fix a typo' --offline --json"))
    assert_equal "recommended", result.fetch("status")
    system libexec/"prototypes/popup/prebuilt/boh-popup", "--self-test"
  end
end
`);
console.log(out);
